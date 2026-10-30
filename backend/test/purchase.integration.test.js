import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHmac } from 'node:crypto';
import { Writable } from 'node:stream';
import { v2 as cloudinary } from 'cloudinary';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../src/app.js';
import AuditEvent from '../src/models/AuditEvent.js';
import Cart from '../src/models/Cart.js';
import CheckoutAttempt from '../src/models/CheckoutAttempt.js';
import IdempotencyKey from '../src/models/IdempotencyKey.js';
import Notification from '../src/models/Notification.js';
import Order from '../src/models/Order.js';
import Product from '../src/models/Product.js';
import ProductCategory from '../src/models/ProductCategory.js';
import Store from '../src/models/Store.js';
import Transaction from '../src/models/Transaction.js';
import User from '../src/models/User.js';
import WebhookEvent from '../src/models/WebhookEvent.js';
import getRazorpayClient from '../src/services/razorpay.js';
import { getIndiaDateString } from '../src/utils/pickupSlots.js';

const originalEnvironment = {
  JWT_SECRET: process.env.JWT_SECRET,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
  RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET
};
let replicaSet;
let server;
let baseUrl;
let razorpayOrderSequence = 0;
let capturedRazorpayOrderId;
let originalCloudinaryUploadStream;
let cloudinaryUploadSequence = 0;

function productFormData(productData) {
  const formData = new FormData();
  formData.append('productData', JSON.stringify(productData));
  formData.append('image', new Blob([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ], { type: 'image/png' }), 'product.png');
  return formData;
}

function categoryFormData(name) {
  const formData = new FormData();
  formData.append('name', name);
  formData.append('image', new Blob([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ], { type: 'image/png' }), 'category.png');
  return formData;
}

before(async () => {
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-integration-tests';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = 'test-razorpay-secret';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'test-webhook-secret';
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
  process.env.CLOUDINARY_API_KEY = 'test-api-key';
  process.env.CLOUDINARY_API_SECRET = 'test-api-secret';
  replicaSet = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60_000 }],
    replSet: { count: 1 }
  });
  await mongoose.connect(replicaSet.getUri(), { dbName: 'purchase_integration' });
  await Promise.all([
    AuditEvent, Cart, CheckoutAttempt, IdempotencyKey, Notification, Order, Product, ProductCategory, Store,
    Transaction, User, WebhookEvent
  ].map(model => model.init()));

  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const razorpay = getRazorpayClient();
  razorpay.orders.create = async () => ({ id: `razorpay_order_test_${++razorpayOrderSequence}` });
  razorpay.payments.fetch = async () => ({
    order_id: capturedRazorpayOrderId,
    amount: 40000,
    currency: 'INR',
    status: 'captured'
  });
  razorpay.payments.refund = async (paymentId, params) => ({
    id: `refund_${paymentId}`,
    payment_id: paymentId,
    amount: params.amount,
    status: 'created',
    notes: params.notes
  });
  originalCloudinaryUploadStream = cloudinary.uploader.upload_stream;
  cloudinary.uploader.upload_stream = (options, callback) => {
    const uploadStream = new Writable({
      write(_chunk, _encoding, done) {
        done();
      }
    });
    uploadStream.on('finish', () => callback(null, {
      secure_url: `https://res.cloudinary.com/test-cloud/image/upload/${options.public_id}.png`,
      public_id: `${options.public_id}-${++cloudinaryUploadSequence}`
    }));
    return uploadStream;
  };
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
  await mongoose.disconnect();
  if (replicaSet) await replicaSet.stop();
  if (originalCloudinaryUploadStream) {
    cloudinary.uploader.upload_stream = originalCloudinaryUploadStream;
  }
  for (const [key, originalValue] of Object.entries(originalEnvironment)) {
    if (originalValue === undefined) delete process.env[key];
    else process.env[key] = originalValue;
  }
});

test('store-created categories persist and support custom product pricing and inventory filters', async () => {
  const store = await Store.create({
    storeName: 'Category Integration Store',
    username: 'category-integration-store',
    password: 'test-password-long-enough',
    location: 'Hyderabad'
  });
  const storeToken = jwt.sign(
    { role: 'store' },
    process.env.JWT_SECRET,
    { subject: String(store._id), expiresIn: '5m', issuer: 'nalli-bokka-api' }
  );
  const headers = {
    authorization: `Bearer ${storeToken}`,
  };

  const missingCategoryImageResponse = await fetch(`${baseUrl}/store/product-categories`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'unillustrated category' })
  });
  assert.equal(missingCategoryImageResponse.status, 400);
  assert.equal(await ProductCategory.exists({ storeId: store._id, normalizedName: 'unillustrated category' }), null);

  const categoryResponse = await fetch(`${baseUrl}/store/product-categories`, {
    method: 'POST',
    headers,
    body: categoryFormData('Pet Supplies')
  });
  assert.equal(categoryResponse.status, 201);
  const createdCategory = (await categoryResponse.json()).data;
  assert.equal(createdCategory.name, 'pet supplies');
  assert.match(createdCategory.imageUrl, /^https:\/\/res\.cloudinary\.com\//);

  const productResponse = await fetch(`${baseUrl}/store/products`, {
    method: 'POST',
    headers: { authorization: headers.authorization },
    body: productFormData({
      productType: 'pet supplies',
      pricingMode: 'pack',
      productName: 'Dog Food',
      packs: [{ label: '2 kg', price: 500 }]
    })
  });
  assert.equal(productResponse.status, 201);
  const product = (await productResponse.json()).data;
  assert.equal(product.productType, 'pet supplies');
  assert.equal(product.pricingMode, 'pack');
  assert.match(product.imageUrl, /^https:\/\/res\.cloudinary\.com\//);
  assert.match(product.imagePublicId, /^[a-f\d]{24}\//);

  const inUseDeleteResponse = await fetch(`${baseUrl}/store/product-categories/pet%20supplies`, {
    method: 'DELETE',
    headers
  });
  assert.equal(inUseDeleteResponse.status, 409);
  assert.match((await inUseDeleteResponse.json()).error, /products in this category/i);

  const otherStore = await Store.create({
    storeName: 'Other Category Store',
    username: 'other-category-store',
    password: 'test-password-long-enough',
    location: 'Hyderabad'
  });
  const otherStoreToken = jwt.sign(
    { role: 'store' },
    process.env.JWT_SECRET,
    { subject: String(otherStore._id), expiresIn: '5m', issuer: 'nalli-bokka-api' }
  );
  const wrongOwnerDeleteResponse = await fetch(`${baseUrl}/store/product-categories/pet%20supplies`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${otherStoreToken}` }
  });
  assert.equal(wrongOwnerDeleteResponse.status, 404);

  const existingCategoryProductResponse = await fetch(`${baseUrl}/store/products`, {
    method: 'POST',
    headers: { authorization: headers.authorization },
    body: productFormData({
      productType: 'meat',
      pricingMode: 'pack',
      productName: 'Packaged Mutton',
      packs: [{ label: '500 g', price: 450 }]
    })
  });
  assert.equal(existingCategoryProductResponse.status, 201);
  assert.equal((await existingCategoryProductResponse.json()).data.pricingMode, 'pack');
  const inUseBuiltInDeleteResponse = await fetch(`${baseUrl}/store/product-categories/meat`, {
    method: 'DELETE',
    headers
  });
  assert.equal(inUseBuiltInDeleteResponse.status, 409);

  const inventoryResponse = await fetch(`${baseUrl}/store/products?productType=pet%20supplies&inStock=true&pricingMode=pack`, {
    headers: { authorization: headers.authorization }
  });
  assert.equal(inventoryResponse.status, 200);
  assert.equal((await inventoryResponse.json()).data[0]._id, product._id);

  const soldOutResponse = await fetch(`${baseUrl}/store/products/${product._id}/stock`, {
    method: 'PATCH',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ inStock: false })
  });
  assert.equal(soldOutResponse.status, 200);
  const publicSoldOutResponse = await fetch(`${baseUrl}/products?storeId=${store._id}&productType=pet%20supplies`);
  assert.equal(publicSoldOutResponse.status, 200);
  const publicSoldOutProducts = await publicSoldOutResponse.json();
  assert.equal(publicSoldOutProducts.data.length, 1);
  assert.equal(publicSoldOutProducts.data[0]._id, product._id);
  assert.equal(publicSoldOutProducts.data[0].inStock, false);
  const publicSoldOutDetailResponse = await fetch(`${baseUrl}/products/${product._id}`);
  assert.equal(publicSoldOutDetailResponse.status, 200);
  assert.equal((await publicSoldOutDetailResponse.json()).data.inStock, false);

  const publicCategoriesResponse = await fetch(`${baseUrl}/products/categories?storeId=${store._id}`);
  assert.equal(publicCategoriesResponse.status, 200);
  const publicCategories = await publicCategoriesResponse.json();
  assert.deepEqual(publicCategories.data, ['pet supplies']);
  assert.equal(publicCategories.images['pet supplies'], createdCategory.imageUrl);
  const otherStoreCategoriesResponse = await fetch(`${baseUrl}/products/categories?storeId=${otherStore._id}`);
  const otherStoreCategories = await otherStoreCategoriesResponse.json();
  assert.deepEqual(otherStoreCategories.data, []);
  assert.deepEqual(otherStoreCategories.images, {});

  const fruitDeleteResponse = await fetch(`${baseUrl}/store/product-categories/fruit`, {
    method: 'DELETE',
    headers
  });
  assert.equal(fruitDeleteResponse.status, 200);
  const storeCategoriesAfterDelete = await fetch(`${baseUrl}/store/product-categories`, { headers });
  assert.equal(storeCategoriesAfterDelete.status, 200);
  assert.equal((await storeCategoriesAfterDelete.json()).data.includes('fruit'), false);
  const publicCategoriesAfterDelete = await fetch(`${baseUrl}/products/categories?storeId=${store._id}`);
  assert.deepEqual((await publicCategoriesAfterDelete.json()).data, ['pet supplies']);
  const restoreBuiltInResponse = await fetch(`${baseUrl}/store/product-categories`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Fruit' })
  });
  assert.equal(restoreBuiltInResponse.status, 201);
  assert.deepEqual((await restoreBuiltInResponse.json()).data, { name: 'fruit' });
  const storeCategoriesAfterRestore = await fetch(`${baseUrl}/store/product-categories`, { headers });
  assert.equal((await storeCategoriesAfterRestore.json()).data.filter(name => name === 'fruit').length, 1);

  const duplicateResponse = await fetch(`${baseUrl}/store/product-categories`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'PET SUPPLIES' })
  });
  assert.equal(duplicateResponse.status, 409);

  const productDeleteResponse = await fetch(`${baseUrl}/store/products/${product._id}`, {
    method: 'DELETE',
    headers: { authorization: headers.authorization }
  });
  assert.equal(productDeleteResponse.status, 204);
  const categoryDeleteResponse = await fetch(`${baseUrl}/store/product-categories/pet%20supplies`, {
    method: 'DELETE',
    headers
  });
  assert.equal(categoryDeleteResponse.status, 200);
  assert.deepEqual((await categoryDeleteResponse.json()).data, { name: 'pet supplies' });
  const deletedCategory = await ProductCategory.findOne({ storeId: store._id, normalizedName: 'pet supplies' });
  assert.equal(deletedCategory.isDeleted, true);
  assert.ok(await AuditEvent.findOne({ actorId: store._id, action: 'product.category.deleted' }));
});

test('deleted inventory products retain their image on historical customer orders', async () => {
  const store = await Store.create({
    storeName: 'Order Image Store',
    username: 'order-image-store',
    password: 'test-password-long-enough',
    location: 'Hyderabad'
  });
  const user = await User.create({ name: 'Order Image Customer', phone: '+15559990001' });
  const product = await Product.create({
    storeId: store._id,
    productType: 'fruit',
    productName: 'Apples',
    imageUrl: 'https://example.test/apples.jpg',
    imagePublicId: 'nalli-bokka/products/order-image-test',
    inStock: true,
    pricePerKg: 200
  });
  const order = await Order.create({
    userId: user._id,
    storeId: store._id,
    orderType: 'pickup',
    pickupAt: new Date(Date.now() + 60 * 60 * 1000),
    items: [{
      productId: product._id,
      productName: product.productName,
      selectionType: 'weight',
      quantity: 1,
      price: 200
    }],
    paymentStatus: 'paid'
  });
  const storeToken = jwt.sign(
    { role: 'store' },
    process.env.JWT_SECRET,
    { subject: String(store._id), expiresIn: '5m', issuer: 'nalli-bokka-api' }
  );
  const customerToken = jwt.sign(
    { role: 'user' },
    process.env.JWT_SECRET,
    { subject: String(user._id), expiresIn: '5m', issuer: 'nalli-bokka-api' }
  );
  const originalCloudinaryDestroy = cloudinary.uploader.destroy;
  let cloudinaryDeleteCalled = false;
  cloudinary.uploader.destroy = async () => {
    cloudinaryDeleteCalled = true;
    return { result: 'ok' };
  };

  try {
    const detailBeforeDeleteResponse = await fetch(`${baseUrl}/orders/${order._id}`, {
      headers: { authorization: `Bearer ${customerToken}` }
    });
    assert.equal(detailBeforeDeleteResponse.status, 200);
    const detailBeforeDelete = await detailBeforeDeleteResponse.json();
    assert.equal(detailBeforeDelete.data.items[0].productId.imageUrl, product.imageUrl);
    assert.equal(detailBeforeDelete.data.items[0].productId.productType, product.productType);

    const deleteResponse = await fetch(`${baseUrl}/store/products/${product._id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${storeToken}` }
    });
    assert.equal(deleteResponse.status, 204);
    const savedOrder = await Order.findById(order._id).lean();
    assert.equal(savedOrder.items[0].imageUrl, product.imageUrl);
    assert.equal(savedOrder.items[0].imagePublicId, product.imagePublicId);
    assert.equal(savedOrder.items[0].productType, product.productType);
    assert.equal(cloudinaryDeleteCalled, false);

    const customerOrdersResponse = await fetch(`${baseUrl}/orders`, {
      headers: { authorization: `Bearer ${customerToken}` }
    });
    assert.equal(customerOrdersResponse.status, 200);
    const customerOrders = await customerOrdersResponse.json();
    assert.equal(customerOrders.data[0].items[0].imageUrl, product.imageUrl);
    assert.equal(customerOrders.data[0].items[0].productId, null);

    const detailAfterDeleteResponse = await fetch(`${baseUrl}/orders/${order._id}`, {
      headers: { authorization: `Bearer ${customerToken}` }
    });
    assert.equal(detailAfterDeleteResponse.status, 200);
    const detailAfterDelete = await detailAfterDeleteResponse.json();
    assert.equal(detailAfterDelete.data.items[0].imageUrl, product.imageUrl);
    assert.equal(detailAfterDelete.data.items[0].productId, null);
  } finally {
    cloudinary.uploader.destroy = originalCloudinaryDestroy;
  }
});

test('customer purchase, payment, and store status notification flow works end to end', async () => {
  const readinessResponse = await fetch(`${baseUrl}/health/ready`);
  assert.equal(readinessResponse.status, 200);
  assert.deepEqual(await readinessResponse.json(), { status: 'ready' });

  const store = await Store.create({
    storeName: 'Integration Store',
    username: 'integration-store',
    password: 'test-password-long-enough',
    location: 'Hyderabad'
  });

  test('order status history records initial and subsequent status changes', async () => {
    const store = await Store.create({
      storeName: 'Status History Store',
      username: 'status-history-store',
      password: 'test-password-long-enough',
      location: 'Hyderabad'
    });
    const user = await User.create({ name: 'Status History Customer', phone: '+15559990031' });
    const order = await Order.create({
      userId: user._id,
      storeId: store._id,
      orderType: 'pickup',
      pickupAt: new Date(Date.now() + 60 * 60 * 1000),
      items: [{
        productId: new mongoose.Types.ObjectId(),
        productName: 'History product',
        selectionType: 'weight',
        quantity: 1,
        price: 200
      }],
      paymentStatus: 'paid'
    });

    assert.equal(order.statusHistory.length, 1);
    assert.equal(order.statusHistory[0].status, 'placed');
    order.orderStatus = 'packing';
    await order.save();
    assert.equal(order.statusHistory.length, 2);
    assert.equal(order.statusHistory[1].status, 'packing');
    assert.ok(order.statusHistory[1].changedAt >= order.statusHistory[0].changedAt);
  });

  test('customer reorder adds available items at current pricing and skips unavailable items', async () => {
    const store = await Store.create({
      storeName: 'Reorder Store',
      username: 'reorder-store',
      password: 'test-password-long-enough',
      location: 'Hyderabad'
    });
    const user = await User.create({ name: 'Reorder Customer', phone: '+15559990032' });
    const availableProduct = await Product.create({
      storeId: store._id,
      productType: 'fruit',
      productName: 'Reorder Apples',
      imageUrl: 'https://example.test/reorder-apples.jpg',
      inStock: true,
      pricePerKg: 250
    });
    const soldOutProduct = await Product.create({
      storeId: store._id,
      productType: 'fruit',
      productName: 'Sold Out Pears',
      imageUrl: 'https://example.test/sold-out-pears.jpg',
      inStock: false,
      pricePerKg: 180
    });
    const order = await Order.create({
      userId: user._id,
      storeId: store._id,
      orderType: 'pickup',
      pickupAt: new Date(Date.now() + 60 * 60 * 1000),
      items: [
        {
          productId: availableProduct._id,
          productName: availableProduct.productName,
          selectionType: 'weight',
          quantity: 1,
          price: 200
        },
        {
          productId: soldOutProduct._id,
          productName: soldOutProduct.productName,
          selectionType: 'weight',
          quantity: 1,
          price: 180
        },
        {
          productId: new mongoose.Types.ObjectId(),
          productName: 'Deleted product',
          selectionType: 'weight',
          quantity: 1,
          price: 100
        }
      ]
    });
    const customerToken = jwt.sign(
      { role: 'user' },
      process.env.JWT_SECRET,
      { subject: String(user._id), expiresIn: '5m', issuer: 'nalli-bokka-api' }
    );
    const response = await fetch(`${baseUrl}/cart/reorder/${order._id}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${customerToken}` }
    });
    assert.equal(response.status, 200);
    const result = (await response.json()).data;
    assert.equal(result.addedItems, 1);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].unitPrice, 250);
    assert.equal(result.total, 250);
    assert.equal(result.skippedItems.length, 2);
    assert.ok(result.skippedItems.some(item => item.reason === 'Product no longer exists'));
    assert.ok(result.skippedItems.some(item => item.productName === 'Sold Out Pears'));

    const otherUser = await User.create({ name: 'Other Reorder Customer', phone: '+15559990033' });
    const otherUserToken = jwt.sign(
      { role: 'user' },
      process.env.JWT_SECRET,
      { subject: String(otherUser._id), expiresIn: '5m', issuer: 'nalli-bokka-api' }
    );
    const unauthorizedResponse = await fetch(`${baseUrl}/cart/reorder/${order._id}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${otherUserToken}` }
    });
    assert.equal(unauthorizedResponse.status, 404);
  });

  test('store dispute notes are scoped to the owning store and returned in transaction details', async () => {
    const store = await Store.create({
      storeName: 'Dispute Notes Store',
      username: 'dispute-notes-store',
      password: 'test-password-long-enough',
      location: 'Hyderabad'
    });
    const otherStore = await Store.create({
      storeName: 'Other Dispute Store',
      username: 'other-dispute-store',
      password: 'test-password-long-enough',
      location: 'Hyderabad'
    });
    const user = await User.create({ name: 'Dispute Notes Customer', phone: '+15559990034' });
    const order = await Order.create({
      userId: user._id,
      storeId: store._id,
      orderType: 'pickup',
      pickupAt: new Date(Date.now() + 60 * 60 * 1000),
      items: [{
        productId: new mongoose.Types.ObjectId(),
        productName: 'Dispute item',
        selectionType: 'weight',
        quantity: 1,
        price: 200
      }],
      paymentStatus: 'paid'
    });
    const transaction = await Transaction.create({
      orderId: order._id,
      razorpayOrderId: `razorpay_dispute_notes_${Date.now()}`,
      paymentId: `payment_dispute_notes_${Date.now()}`,
      amount: 200,
      status: 'paid'
    });
    const tokenForStore = storeId => jwt.sign(
      { role: 'store' },
      process.env.JWT_SECRET,
      { subject: String(storeId), expiresIn: '5m', issuer: 'nalli-bokka-api' }
    );
    const noteResponse = await fetch(`${baseUrl}/store/transactions/${transaction._id}/notes`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenForStore(store._id)}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ note: 'Customer confirmed the delivery timestamp.' })
    });
    assert.equal(noteResponse.status, 201);
    const note = (await noteResponse.json()).data;
    assert.equal(note.note, 'Customer confirmed the delivery timestamp.');
    assert.ok(note._id);
    assert.ok(note.createdAt);

    const unauthorizedResponse = await fetch(`${baseUrl}/store/transactions/${transaction._id}/notes`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenForStore(otherStore._id)}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ note: 'This store must not see the transaction.' })
    });
    assert.equal(unauthorizedResponse.status, 404);

    const detailResponse = await fetch(`${baseUrl}/store/transactions/${transaction._id}`, {
      headers: { authorization: `Bearer ${tokenForStore(store._id)}` }
    });
    assert.equal(detailResponse.status, 200);
    const detail = (await detailResponse.json()).data;
    assert.equal(detail.caseNotes.length, 1);
    assert.equal(detail.caseNotes[0].note, note.note);
  });
  const user = await User.create({
    name: 'Test Customer',
    phone: '+15551234567',
    addresses: [{
      label: 'Home',
      fullAddress: '12 Example Road, Hyderabad',
      pincode: '500001'
    }]
  });
  const otherUser = await User.create({ name: 'Other Customer', phone: '+15551234568' });
  const product = await Product.create({
    storeId: store._id,
    productType: 'meat',
    productName: 'Mutton',
    imageUrl: 'https://example.test/mutton.jpg',
    inStock: true,
    pricePerKg: 800
  });
  await Cart.create({
    userId: user._id,
    items: [{ productId: product._id, selectionType: 'weight', selectedQuantity: 0.5 }]
  });
  const customerToken = jwt.sign(
    { role: 'user' },
    process.env.JWT_SECRET,
    { subject: String(user._id), expiresIn: '5m', issuer: 'nalli-bokka-api' }
  );
  const storeToken = jwt.sign(
    { role: 'store' },
    process.env.JWT_SECRET,
    { subject: String(store._id), expiresIn: '5m', issuer: 'nalli-bokka-api' }
  );
  const otherCustomerToken = jwt.sign(
    { role: 'user' },
    process.env.JWT_SECRET,
    { subject: String(otherUser._id), expiresIn: '5m', issuer: 'nalli-bokka-api' }
  );

  const failedAttemptResponse = await fetch(`${baseUrl}/payments/razorpay/order`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${customerToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      addressId: String(user.addresses[0]._id),
      storeId: String(store._id),
      idempotencyKey: '33333333-3333-4333-8333-333333333333'
    })
  });
  assert.equal(failedAttemptResponse.status, 201);
  const failedAttemptPayment = (await failedAttemptResponse.json()).data;
  assert.equal(failedAttemptPayment.amount, 40000);
  assert.equal(await Order.countDocuments({ userId: user._id }), 0);
  assert.equal((await Cart.findOne({ userId: user._id })).items.length, 1);

  const failedResponse = await fetch(`${baseUrl}/payments/razorpay/${failedAttemptPayment.razorpayOrderId}/failed`, {
    method: 'POST',
    headers: { authorization: `Bearer ${customerToken}` }
  });
  assert.equal(failedResponse.status, 200);
  assert.deepEqual((await failedResponse.json()).data, { status: 'failed', orderCreated: false });
  assert.equal(await Order.countDocuments({ userId: user._id }), 0);
  assert.equal((await Cart.findOne({ userId: user._id })).items.length, 1);

  const webhookFailedAttemptResponse = await fetch(`${baseUrl}/payments/razorpay/order`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${customerToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      addressId: String(user.addresses[0]._id),
      storeId: String(store._id),
      idempotencyKey: '55555555-5555-4555-8555-555555555555'
    })
  });
  assert.equal(webhookFailedAttemptResponse.status, 201);
  const webhookFailedPayment = (await webhookFailedAttemptResponse.json()).data;
  const failedWebhookBody = JSON.stringify({
    event: 'payment.failed',
    payload: {
      payment: {
        entity: {
          id: 'razorpay_payment_failed',
          order_id: webhookFailedPayment.razorpayOrderId,
          amount: 40000,
          currency: 'INR',
          status: 'failed'
        }
      }
    }
  });
  const failedWebhookSignature = createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(failedWebhookBody)
    .digest('hex');
  const failedWebhookResponse = await fetch(`${baseUrl}/payments/razorpay/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': failedWebhookSignature,
      'x-razorpay-event-id': 'evt_checkout_payment_failed'
    },
    body: failedWebhookBody
  });
  assert.equal(failedWebhookResponse.status, 200);
  assert.equal(await Order.countDocuments({ userId: user._id }), 0);
  assert.equal((await CheckoutAttempt.findOne({ razorpayOrderId: webhookFailedPayment.razorpayOrderId })).status, 'failed');
  assert.equal((await Cart.findOne({ userId: user._id })).items.length, 1);

  const paymentOrderResponse = await fetch(`${baseUrl}/payments/razorpay/order`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${customerToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      addressId: String(user.addresses[0]._id),
      storeId: String(store._id),
      idempotencyKey: '44444444-4444-4444-8444-444444444444'
    })
  });
  assert.equal(paymentOrderResponse.status, 201);
  const paymentOrder = (await paymentOrderResponse.json()).data;
  assert.equal(paymentOrder.amount, 40000);
  assert.equal(await Order.countDocuments({ userId: user._id }), 0);
  capturedRazorpayOrderId = paymentOrder.razorpayOrderId;

  const paymentId = 'razorpay_payment_test';
  const signature = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${paymentOrder.razorpayOrderId}|${paymentId}`)
    .digest('hex');
  const verifyResponse = await fetch(`${baseUrl}/payments/razorpay/verify`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${customerToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      razorpayOrderId: paymentOrder.razorpayOrderId,
      paymentId,
      signature
    })
  });
  const verifyBody = await verifyResponse.json();
  assert.equal(verifyResponse.status, 200, JSON.stringify(verifyBody));
  const verifiedPayment = verifyBody.data;
  const order = await Order.findById(verifiedPayment.orderId);
  assert.ok(order);
  assert.equal(order.totalAmount, 400);
  assert.equal(order.items[0].price, 400);
  assert.equal(order.items[0].imageUrl, product.imageUrl);
  assert.equal(order.items[0].imagePublicId, product.imagePublicId);
  assert.equal(order.items[0].productType, product.productType);
  assert.equal(order.paymentStatus, 'paid');
  assert.equal((await Cart.findOne({ userId: user._id })).items.length, 0);
  assert.equal((await Transaction.findOne({ orderId: order._id })).status, 'paid');

  const range = {
    from: '2000-01-01T00:00:00.000Z',
    to: '2100-01-01T00:00:00.000Z'
  };
  const ordersExportResponse = await fetch(`${baseUrl}/store/reports/export?${new URLSearchParams({ type: 'orders', ...range })}`, {
    headers: { authorization: `Bearer ${storeToken}` }
  });
  assert.equal(ordersExportResponse.status, 200);
  assert.match(ordersExportResponse.headers.get('content-type'), /text\/csv/);
  const ordersCsv = await ordersExportResponse.text();
  assert.match(ordersCsv, /order_id,created_at,order_status,payment_status,total_amount,items/);
  assert.ok(ordersCsv.includes(String(order._id)));
  assert.ok(ordersCsv.includes('Mutton'));
  assert.equal(ordersCsv.includes('12 Example Road'), false);

  const transactionsExportResponse = await fetch(`${baseUrl}/store/reports/export?${new URLSearchParams({ type: 'transactions', ...range })}`, {
    headers: { authorization: `Bearer ${storeToken}` }
  });
  assert.equal(transactionsExportResponse.status, 200);
  const transactionsCsv = await transactionsExportResponse.text();
  assert.match(transactionsCsv, /timestamp,order_id,status,amount,refund_status,refund_id/);
  assert.ok(transactionsCsv.includes(String(order._id)));
  assert.ok(transactionsCsv.includes('"paid"'));

  const statusResponse = await fetch(`${baseUrl}/store/orders/${order._id}/status`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${storeToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ orderStatus: 'packing' })
  });
  assert.equal(statusResponse.status, 200);
  assert.equal((await Order.findById(order._id)).orderStatus, 'packing');
  const orderStatusAudit = await AuditEvent.findOne({ entityId: order._id, action: 'order.status_updated' });
  assert.equal(orderStatusAudit.previousState, 'placed');
  assert.equal(orderStatusAudit.nextState, 'packing');
  assert.equal(orderStatusAudit.actorId.toString(), store._id.toString());
  assert.ok(orderStatusAudit.requestId);

  const notificationsResponse = await fetch(`${baseUrl}/users/me/notifications`, {
    headers: { authorization: `Bearer ${customerToken}` }
  });
  assert.equal(notificationsResponse.status, 200);
  const notifications = await notificationsResponse.json();
  assert.equal(notifications.unreadCount, 2);
  assert.equal(notifications.data[0].message, 'Your order has been accepted and is being prepared.');

  const otherCustomerNotifications = await fetch(`${baseUrl}/users/me/notifications`, {
    headers: { authorization: `Bearer ${otherCustomerToken}` }
  });
  assert.equal(otherCustomerNotifications.status, 200);
  assert.equal((await otherCustomerNotifications.json()).unreadCount, 0);
  const deniedReadResponse = await fetch(`${baseUrl}/users/me/notifications/${notifications.data[0]._id}/read`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${otherCustomerToken}` }
  });
  assert.equal(deniedReadResponse.status, 404);

  const markReadResponse = await fetch(`${baseUrl}/users/me/notifications/${notifications.data[0]._id}/read`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${customerToken}` }
  });
  assert.equal(markReadResponse.status, 200);
  assert.ok((await markReadResponse.json()).data.readAt);
  assert.equal(await Notification.countDocuments({ userId: user._id, readAt: null }), 1);

  const deliveryResponse = await fetch(`${baseUrl}/store/orders/${order._id}/status`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${storeToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ orderStatus: 'out for delivery' })
  });
  assert.equal(deliveryResponse.status, 200);
  const markAllReadResponse = await fetch(`${baseUrl}/users/me/notifications/read-all`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${customerToken}` }
  });
  assert.equal(markAllReadResponse.status, 200);
  assert.equal((await markAllReadResponse.json()).data.updatedCount, 2);
  assert.equal(await Notification.countDocuments({ userId: user._id, readAt: null }), 0);

  const stockResponse = await fetch(`${baseUrl}/store/products/${product._id}/stock`, {
    method: 'PATCH',
    headers: {
      authorization: 'Bearer ' + storeToken,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ inStock: false })
  });
  assert.equal(stockResponse.status, 200);
  const stockAudit = await AuditEvent.findOne({ entityId: product._id, action: 'product.stock_updated' });
  assert.equal(stockAudit.previousState, 'true');
  assert.equal(stockAudit.nextState, 'false');

  await Product.updateOne({ _id: product._id }, { $set: { inStock: true } });
  await Cart.updateOne(
    { userId: user._id },
    { $set: { items: [{ productId: product._id, selectionType: 'weight', selectedQuantity: 0.5 }] } }
  );
  const beforeClosePaymentResponse = await fetch(`${baseUrl}/payments/razorpay/order`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${customerToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      addressId: String(user.addresses[0]._id),
      storeId: String(store._id),
      idempotencyKey: '77777777-7777-4777-8777-777777777777'
    })
  });
  assert.equal(beforeClosePaymentResponse.status, 201);
  const beforeClosePayment = (await beforeClosePaymentResponse.json()).data;
  const storeCloseResponse = await fetch(`${baseUrl}/store/status`, {
    method: 'PATCH',
    headers: {
      authorization: 'Bearer ' + storeToken,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ isOpen: false })
  });
  assert.equal(storeCloseResponse.status, 200);
  const storeStatusAudit = await AuditEvent.findOne({ entityId: store._id, action: 'store.open_status_updated' });
  assert.equal(storeStatusAudit.previousState, 'true');
  assert.equal(storeStatusAudit.nextState, 'false');
  const attemptsBeforeClosedCheckout = await CheckoutAttempt.countDocuments({ userId: user._id });
  const providerOrdersBeforeClosedCheckout = razorpayOrderSequence;
  const closedCheckoutResponse = await fetch(`${baseUrl}/payments/razorpay/order`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${customerToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      addressId: String(user.addresses[0]._id),
      storeId: String(store._id),
      idempotencyKey: '66666666-6666-4666-8666-666666666666'
    })
  });
  assert.equal(closedCheckoutResponse.status, 409);
  assert.match((await closedCheckoutResponse.json()).error, /store is closed/i);
  const resumedClosedCheckoutResponse = await fetch(`${baseUrl}/payments/razorpay/order`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${customerToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      addressId: String(user.addresses[0]._id),
      storeId: String(store._id),
      idempotencyKey: '77777777-7777-4777-8777-777777777777'
    })
  });
  assert.equal(resumedClosedCheckoutResponse.status, 409);
  assert.match((await resumedClosedCheckoutResponse.json()).error, /store is closed/i);
  assert.equal(await CheckoutAttempt.countDocuments({ userId: user._id }), attemptsBeforeClosedCheckout);
  assert.equal(razorpayOrderSequence, providerOrdersBeforeClosedCheckout);
  assert.equal(await Order.countDocuments({ userId: user._id }), 1);
  capturedRazorpayOrderId = beforeClosePayment.razorpayOrderId;
  const capturedPaymentId = 'razorpay_payment_during_store_closure';
  const capturedPaymentSignature = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${beforeClosePayment.razorpayOrderId}|${capturedPaymentId}`)
    .digest('hex');
  const capturedPaymentResponse = await fetch(`${baseUrl}/payments/razorpay/verify`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${customerToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      razorpayOrderId: beforeClosePayment.razorpayOrderId,
      paymentId: capturedPaymentId,
      signature: capturedPaymentSignature
    })
  });
  assert.equal(capturedPaymentResponse.status, 200);
  const capturedDuringClosure = (await capturedPaymentResponse.json()).data;
  assert.ok(await Order.findById(capturedDuringClosure.orderId));
  assert.equal(await Order.countDocuments({ userId: user._id }), 2);
  const storeReopenResponse = await fetch(`${baseUrl}/store/status`, {
    method: 'PATCH',
    headers: {
      authorization: 'Bearer ' + storeToken,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ isOpen: true })
  });
  assert.equal(storeReopenResponse.status, 200);

  await Order.updateOne({ _id: order._id }, { $set: { createdAt: new Date(Date.now() - 60_000) } });
  await Order.create({
    userId: user._id,
    storeId: store._id,
    deliveryAddress: order.deliveryAddress,
    items: [{ ...order.items[0].toObject(), price: 600 }],
    totalAmount: 600,
    orderStatus: 'placed',
    paymentStatus: 'paid'
  });
  const storeOrderHeaders = { authorization: `Bearer ${storeToken}` };
  const searchByOrderId = await fetch(`${baseUrl}/store/orders?${new URLSearchParams({ search: order._id.toString().slice(-8) })}`, {
    headers: storeOrderHeaders
  });
  assert.equal(searchByOrderId.status, 200);
  assert.deepEqual((await searchByOrderId.json()).data.map(item => item._id), [order._id.toString()]);
  const searchByName = await fetch(`${baseUrl}/store/orders?${new URLSearchParams({ search: 'test customer', limit: '100' })}`, {
    headers: storeOrderHeaders
  });
  assert.equal(searchByName.status, 200);
  assert.equal((await searchByName.json()).pagination.total, 3);
  const searchByPhone = await fetch(`${baseUrl}/store/orders?${new URLSearchParams({ search: '5551234567', limit: '100' })}`, {
    headers: storeOrderHeaders
  });
  assert.equal(searchByPhone.status, 200);
  assert.equal((await searchByPhone.json()).pagination.total, 3);
  const sortByHighestTotal = await fetch(`${baseUrl}/store/orders?sort=amount_desc`, { headers: storeOrderHeaders });
  assert.equal(sortByHighestTotal.status, 200);
  assert.equal((await sortByHighestTotal.json()).data[0].totalAmount, 600);
  const sortOldestFirst = await fetch(`${baseUrl}/store/orders?sort=oldest`, { headers: storeOrderHeaders });
  assert.equal(sortOldestFirst.status, 200);
  assert.equal((await sortOldestFirst.json()).data[0]._id, order._id.toString());
  const regexCharactersAreLiteral = await fetch(`${baseUrl}/store/orders?search=${encodeURIComponent('.*')}`, {
    headers: storeOrderHeaders
  });
  assert.equal(regexCharactersAreLiteral.status, 200);
  assert.equal((await regexCharactersAreLiteral.json()).pagination.total, 0);
});

test('store hours generate pickup slots and pickup orders use pickup-specific status transitions', async () => {
  const store = await Store.create({
    storeName: 'Pickup Hours Store',
    username: 'pickup-hours-store',
    password: 'test-password-long-enough',
    location: 'Hyderabad'
  });
  const user = await User.create({
    name: 'Pickup Customer',
    phone: '+15551234588'
  });
  const storeToken = jwt.sign({ role: 'store' }, process.env.JWT_SECRET, {
    subject: String(store._id), expiresIn: '5m', issuer: 'nalli-bokka-api'
  });
  const userToken = jwt.sign({ role: 'user' }, process.env.JWT_SECRET, {
    subject: String(user._id), expiresIn: '5m', issuer: 'nalli-bokka-api'
  });
  const storeHeaders = {
    authorization: `Bearer ${storeToken}`,
    'content-type': 'application/json'
  };

  const invalidHoursResponse = await fetch(`${baseUrl}/store/hours`, {
    method: 'PATCH',
    headers: storeHeaders,
    body: JSON.stringify({ openingTime: '09:15', closingTime: '18:00' })
  });
  assert.equal(invalidHoursResponse.status, 400);

  const hoursResponse = await fetch(`${baseUrl}/store/hours`, {
    method: 'PATCH',
    headers: storeHeaders,
    body: JSON.stringify({ openingTime: '09:00', closingTime: '10:00' })
  });
  const hoursPayload = await hoursResponse.json();
  assert.equal(hoursResponse.status, 200, JSON.stringify(hoursPayload));
  assert.equal(hoursPayload.data.openingTime, '09:00');

  const pickupDate = getIndiaDateString(new Date(Date.now() + 36 * 60 * 60 * 1000));
  const slotsResponse = await fetch(`${baseUrl}/stores/${store._id}/pickup-slots?date=${pickupDate}`);
  assert.equal(slotsResponse.status, 200);
  const slots = (await slotsResponse.json()).data.slots;
  assert.equal(slots.length, 2);
  assert.equal(slots[0].endAt, slots[1].startAt);

  const order = await Order.create({
    userId: user._id,
    storeId: store._id,
    orderType: 'pickup',
    pickupAt: new Date(slots[0].startAt),
    items: [{
      productId: new mongoose.Types.ObjectId(),
      productName: 'Pickup item',
      selectionType: 'pieces',
      quantity: 1,
      price: 150
    }],
    paymentStatus: 'paid'
  });

  const updateStatus = (orderStatus) => fetch(`${baseUrl}/store/orders/${order._id}/status`, {
    method: 'PATCH',
    headers: storeHeaders,
    body: JSON.stringify({ orderStatus })
  });
  assert.equal((await updateStatus('packing')).status, 200);
  assert.equal((await updateStatus('ready for pickup')).status, 200);
  assert.equal((await updateStatus('picked up')).status, 200);
  assert.equal((await Order.findById(order._id)).orderStatus, 'picked up');

  const pickupOrdersResponse = await fetch(`${baseUrl}/store/orders?orderType=pickup`, {
    headers: { authorization: `Bearer ${storeToken}` }
  });
  assert.equal(pickupOrdersResponse.status, 200);
  assert.ok((await pickupOrdersResponse.json()).data.some(({ _id }) => _id === String(order._id)));
  const customerPickupResponse = await fetch(`${baseUrl}/orders?orderType=pickup`, {
    headers: { authorization: `Bearer ${userToken}` }
  });
  assert.equal(customerPickupResponse.status, 200);
  assert.equal((await customerPickupResponse.json()).pagination.total, 1);
});

test('mobile Razorpay callback verifies payment and redirects to the created order', async () => {
  process.env.RENDER_EXTERNAL_URL = new URL(baseUrl).origin;
  const store = await Store.create({
    storeName: 'Mobile Checkout Store',
    username: 'mobile-checkout-store',
    password: 'test-password-long-enough',
    location: 'Hyderabad'
  });
  const user = await User.create({
    name: 'Mobile Checkout Customer',
    phone: '+15551234570',
    addresses: [{
      label: 'Home',
      fullAddress: '15 Mobile Road, Hyderabad',
      pincode: '500001'
    }]
  });
  const product = await Product.create({
    storeId: store._id,
    productType: 'vegetable',
    productName: 'Mobile Checkout Tomatoes',
    imageUrl: 'https://example.test/tomatoes.jpg',
    inStock: true,
    pricePerKg: 800
  });
  await Cart.create({
    userId: user._id,
    items: [{ productId: product._id, selectionType: 'weight', selectedQuantity: 0.5 }]
  });
  const token = jwt.sign({ role: 'user' }, process.env.JWT_SECRET, {
    subject: String(user._id), expiresIn: '5m', issuer: 'nalli-bokka-api'
  });
  const origin = 'http://localhost:5173';
  const pickupDate = getIndiaDateString(new Date(Date.now() + 36 * 60 * 60 * 1000));
  const pickupSlotsResponse = await fetch(`${baseUrl}/stores/${store._id}/pickup-slots?date=${pickupDate}`);
  assert.equal(pickupSlotsResponse.status, 200);
  const pickupAt = (await pickupSlotsResponse.json()).data.slots[0].startAt;
  const paymentResponse = await fetch(`${baseUrl}/payments/razorpay/order`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      origin,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      orderType: 'pickup',
      pickupAt,
      storeId: String(store._id),
      idempotencyKey: '55555555-5555-4555-8555-555555555555'
    })
  });
  assert.equal(paymentResponse.status, 201);
  const payment = (await paymentResponse.json()).data;
  const attempt = await CheckoutAttempt.findOne({ razorpayOrderId: payment.razorpayOrderId });
  assert.equal(attempt.orderType, 'pickup');
  assert.equal(attempt.pickupAt.toISOString(), pickupAt);
  assert.equal(new URL(payment.callbackUrl).origin, new URL(baseUrl).origin);
  assert.equal(new URL(payment.callbackUrl).pathname, '/api/payments/razorpay/callback');

  const paymentId = 'razorpay_payment_mobile_callback';
  const signature = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${payment.razorpayOrderId}|${paymentId}`)
    .digest('hex');
  capturedRazorpayOrderId = payment.razorpayOrderId;
  const razorpay = getRazorpayClient();
  const originalFetch = razorpay.payments.fetch;
  const originalCapture = razorpay.payments.capture;
  let captureCalled = false;
  razorpay.payments.fetch = async () => ({
    order_id: capturedRazorpayOrderId,
    amount: 40000,
    currency: 'INR',
    status: 'authorized'
  });
  razorpay.payments.capture = async (capturedPaymentId, amount, currency) => {
    captureCalled = true;
    assert.equal(capturedPaymentId, paymentId);
    assert.equal(amount, 40000);
    assert.equal(currency, 'INR');
    return {
      order_id: capturedRazorpayOrderId,
      amount,
      currency,
      status: 'captured'
    };
  };
  let callbackResponse;
  try {
    callbackResponse = await fetch(payment.callbackUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        razorpay_order_id: payment.razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature
      }),
      redirect: 'manual'
    });
  } finally {
    razorpay.payments.fetch = originalFetch;
    razorpay.payments.capture = originalCapture;
  }
  assert.equal(captureCalled, true);
  assert.equal(callbackResponse.status, 303);
  const redirectUrl = new URL(callbackResponse.headers.get('location'));
  assert.equal(redirectUrl.origin, origin);
  assert.equal(redirectUrl.pathname, '/orders');
  const order = await Order.findById(redirectUrl.searchParams.get('order'));
  assert.ok(order);
  assert.equal(order.paymentStatus, 'paid');
  assert.equal(order.orderType, 'pickup');
  assert.equal(order.pickupAt.toISOString(), pickupAt);
  assert.equal(order.deliveryAddress, undefined);
  assert.equal((await Cart.findOne({ userId: user._id })).items.length, 0);
});

test('store refunds are scoped, full, single-request, and settled by deduplicated webhooks', async () => {
  const store = await Store.create({
    storeName: 'Refund Store',
    username: 'refund-store',
    password: 'test-password-long-enough',
    location: 'Hyderabad',
    storePhone: '+911234567890'
  });
  const otherStore = await Store.create({
    storeName: 'Other Refund Store',
    username: 'other-refund-store',
    password: 'test-password-long-enough',
    location: 'Hyderabad'
  });
  const user = await User.create({ name: 'Refund Customer', phone: '+15551234569' });
  const storeToken = jwt.sign({ role: 'store' }, process.env.JWT_SECRET, {
    subject: String(store._id), expiresIn: '5m', issuer: 'nalli-bokka-api'
  });
  const otherStoreToken = jwt.sign({ role: 'store' }, process.env.JWT_SECRET, {
    subject: String(otherStore._id), expiresIn: '5m', issuer: 'nalli-bokka-api'
  });
  const customerToken = jwt.sign({ role: 'user' }, process.env.JWT_SECRET, {
    subject: String(user._id), expiresIn: '5m', issuer: 'nalli-bokka-api'
  });

  async function createPaidOrder(suffix) {
    const order = await Order.create({
      userId: user._id,
      storeId: store._id,
      deliveryAddress: { label: 'Home', fullAddress: '12 Example Road', pincode: '500001' },
      items: [{
        productId: new mongoose.Types.ObjectId(),
        productName: 'Mutton',
        selectionType: 'pieces',
        quantity: 1,
        price: 400
      }],
      orderStatus: 'placed',
      paymentStatus: 'paid'
    });
    const transaction = await Transaction.create({
      orderId: order._id,
      razorpayOrderId: `razorpay_order_${suffix}`,
      paymentId: `razorpay_payment_${suffix}`,
      amount: 400,
      status: 'paid'
    });
    return { order, transaction };
  }

  async function sendRefundWebhook(eventName, eventId, transaction, requestId, status) {
    const body = JSON.stringify({
      event: eventName,
      payload: {
        refund: {
          entity: {
            id: `refund_${transaction.paymentId}`,
            payment_id: transaction.paymentId,
            amount: 40000,
            currency: 'INR',
            status,
            notes: { refundRequestId: requestId }
          }
        }
      }
    });
    const signature = createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');
    return fetch(`${baseUrl}/payments/razorpay/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': signature,
        'x-razorpay-event-id': eventId
      },
      body
    });
  }

  const { order, transaction } = await createPaidOrder('processed');
  let providerCalls = 0;
  const razorpay = getRazorpayClient();
  razorpay.payments.refund = async (paymentId, params) => {
    providerCalls += 1;
    assert.match(paymentId, /^razorpay_payment_/);
    assert.equal(params.amount, 40000);
    return {
      id: `refund_${paymentId}`,
      payment_id: paymentId,
      amount: params.amount,
      status: 'created',
      notes: params.notes
    };
  };

  const forbiddenResponse = await fetch(`${baseUrl}/store/orders/${order._id}/refund`, {
    method: 'POST',
    headers: { authorization: `Bearer ${otherStoreToken}` }
  });
  assert.equal(forbiddenResponse.status, 404);
  assert.equal(providerCalls, 0);

  const partialRefundResponse = await fetch(`${baseUrl}/store/orders/${order._id}/refund`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${storeToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ amount: 1 })
  });
  assert.equal(partialRefundResponse.status, 400);
  assert.equal((await Order.findById(order._id)).paymentStatus, 'paid');

  const refundResponse = await fetch(`${baseUrl}/store/orders/${order._id}/refund`, {
    method: 'POST',
    headers: { authorization: `Bearer ${storeToken}` }
  });
  assert.equal(refundResponse.status, 202);
  const pendingRefund = (await refundResponse.json()).data;
  assert.equal(pendingRefund.refundStatus, 'pending');
  const cancelledWhileRefundPending = await Order.findById(order._id);
  assert.equal(cancelledWhileRefundPending.paymentStatus, 'refund_pending');
  assert.equal(cancelledWhileRefundPending.orderStatus, 'cancelled');
  const cancellationNotification = await Notification.findOne({ orderId: order._id });
  assert.equal(cancellationNotification.message, 'The store cancelled your order and requested a full refund. Refund processing is pending.');
  const refundAudit = await AuditEvent.findOne({ entityId: order._id, action: 'order.refund_requested' });
  assert.equal(refundAudit.previousState, 'paid');
  assert.equal(refundAudit.nextState, 'refund_pending/cancelled');
  const auditResponse = await fetch(`${baseUrl}/store/audit-events?page=1&limit=100`, {
    headers: { authorization: 'Bearer ' + storeToken }
  });
  assert.equal(auditResponse.status, 200);
  const storeAuditEvents = (await auditResponse.json()).data;
  assert.ok(storeAuditEvents.some(event => event._id === String(refundAudit._id)));
  const otherStoreAuditResponse = await fetch(`${baseUrl}/store/audit-events`, {
    headers: { authorization: 'Bearer ' + otherStoreToken }
  });
  assert.equal(otherStoreAuditResponse.status, 200);
  assert.equal((await otherStoreAuditResponse.json()).pagination.total, 0);
  const pendingOrderResponse = await fetch(`${baseUrl}/orders/${order._id}`, {
    headers: { authorization: 'Bearer ' + customerToken }
  });
  assert.equal(pendingOrderResponse.status, 200);
  const pendingOrderData = (await pendingOrderResponse.json()).data;
  assert.equal(pendingOrderData.refund.status, 'pending');
  assert.equal(pendingOrderData.refund.amount, 400);
  assert.equal(pendingOrderData.refund.reference, `refund_${transaction.paymentId}`);
  assert.ok(pendingOrderData.refund.requestedAt);
  assert.equal(pendingOrderData.storeId.storePhone, '+911234567890');

  const repeatedRefundResponse = await fetch(`${baseUrl}/store/orders/${order._id}/refund`, {
    method: 'POST',
    headers: { authorization: `Bearer ${storeToken}` }
  });
  assert.equal(repeatedRefundResponse.status, 202);
  assert.equal(providerCalls, 1);

  const pausedFulfillmentResponse = await fetch(`${baseUrl}/store/orders/${order._id}/status`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${storeToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ orderStatus: 'packing' })
  });
  assert.equal(pausedFulfillmentResponse.status, 409);
  const blockedPaymentResponse = await fetch(`${baseUrl}/orders/${order._id}/payment`, {
    method: 'POST',
    headers: { authorization: `Bearer ${customerToken}` }
  });
  assert.equal(blockedPaymentResponse.status, 409);
  const blockedCancellationResponse = await fetch(`${baseUrl}/orders/${order._id}/cancel`, {
    method: 'POST',
    headers: { authorization: `Bearer ${customerToken}` }
  });
  assert.equal(blockedCancellationResponse.status, 409);

  const processedWebhook = await sendRefundWebhook(
    'refund.processed',
    'evt_refund_processed',
    transaction,
    pendingRefund.refundRequestId || (await Transaction.findById(transaction._id)).refundRequestId,
    'processed'
  );
  assert.equal(processedWebhook.status, 200);
  assert.equal((await Order.findById(order._id)).paymentStatus, 'refunded');
  assert.equal((await Order.findById(order._id)).orderStatus, 'cancelled');
  assert.equal((await Transaction.findById(transaction._id)).refundStatus, 'processed');
  assert.equal(await Notification.countDocuments({ orderId: order._id }), 1);
  assert.equal((await Notification.findOne({ orderId: order._id })).message, 'Your order was cancelled and your full refund has been processed.');
  const processedOrderResponse = await fetch(`${baseUrl}/orders/${order._id}`, {
    headers: { authorization: 'Bearer ' + customerToken }
  });
  assert.equal(processedOrderResponse.status, 200);
  const processedOrderData = (await processedOrderResponse.json()).data;
  assert.equal(processedOrderData.refund.status, 'processed');
  assert.equal(processedOrderData.refund.reference, `refund_${transaction.paymentId}`);
  assert.ok(processedOrderData.refund.updatedAt);

  const duplicateWebhook = await sendRefundWebhook(
    'refund.processed',
    'evt_refund_processed',
    transaction,
    (await Transaction.findById(transaction._id)).refundRequestId,
    'processed'
  );
  assert.equal(duplicateWebhook.status, 200);
  assert.equal(await Notification.countDocuments({ orderId: order._id }), 1);

  const { order: failedOrder, transaction: failedTransaction } = await createPaidOrder('failed');
  const failedRefundResponse = await fetch(`${baseUrl}/store/orders/${failedOrder._id}/refund`, {
    method: 'POST',
    headers: { authorization: `Bearer ${storeToken}` }
  });
  assert.equal(failedRefundResponse.status, 202);
  const failedPending = (await failedRefundResponse.json()).data;
  const failedWebhook = await sendRefundWebhook(
    'refund.failed',
    'evt_refund_failed',
    failedTransaction,
    (await Transaction.findById(failedTransaction._id)).refundRequestId,
    'failed'
  );
  assert.equal(failedWebhook.status, 200);
  assert.equal((await Order.findById(failedOrder._id)).paymentStatus, 'refund_failed');
  assert.equal((await Order.findById(failedOrder._id)).orderStatus, 'cancelled');
  assert.equal((await Transaction.findById(failedTransaction._id)).refundStatus, 'failed');
  assert.equal(failedPending.refundStatus, 'pending');
  assert.match((await Notification.findOne({ orderId: failedOrder._id })).message, /order was cancelled, but the full refund could not be completed/);

  const failedRetryResponse = await fetch(`${baseUrl}/store/orders/${failedOrder._id}/refund`, {
    method: 'POST',
    headers: { authorization: `Bearer ${storeToken}` }
  });
  assert.equal(failedRetryResponse.status, 200);
  assert.equal((await failedRetryResponse.json()).data.refundStatus, 'failed');
});

test('bulk cart updates validate all selections and clear the cart in one request', async () => {
  const store = await Store.create({
    storeName: 'Bulk Cart Store',
    username: 'bulk-cart-store',
    password: 'test-password-long-enough',
    location: 'Hyderabad'
  });
  const user = await User.create({ name: 'Bulk Cart Customer', phone: '+15551234571' });
  const product = await Product.create({
    storeId: store._id,
    productType: 'oil',
    productName: 'Bulk Cart Oil',
    imageUrl: 'https://example.test/oil.jpg',
    inStock: true,
    packs: [
      { label: '1 L', price: 10 },
      { label: '5 L', price: 40 }
    ]
  });
  const token = jwt.sign({ role: 'user' }, process.env.JWT_SECRET, {
    subject: String(user._id), expiresIn: '5m', issuer: 'nalli-bokka-api'
  });
  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json'
  };

  const invalidResponse = await fetch(`${baseUrl}/cart/items/bulk`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      productId: String(product._id),
      items: [
        { selectionType: 'pack', selectedQuantity: 1, selectedPackLabel: '1 L' },
        { selectionType: 'pack', selectedQuantity: 1, selectedPackLabel: 'unknown' }
      ]
    })
  });
  assert.equal(invalidResponse.status, 400);
  assert.equal(await Cart.exists({ userId: user._id }), null);

  const addResponse = await fetch(`${baseUrl}/cart/items/bulk`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      productId: String(product._id),
      items: [
        { selectionType: 'pack', selectedQuantity: 1, selectedPackLabel: '1 L' },
        { selectionType: 'pack', selectedQuantity: 2, selectedPackLabel: '1 L' },
        { selectionType: 'pack', selectedQuantity: 1, selectedPackLabel: '5 L' }
      ]
    })
  });
  assert.equal(addResponse.status, 201);
  const addedCart = (await addResponse.json()).data;
  assert.equal(addedCart.items.length, 2);
  assert.equal(addedCart.items.find(item => item.selectedPackLabel === '1 L').selectedQuantity, 3);
  assert.equal(addedCart.total, 70);

  const clearResponse = await fetch(`${baseUrl}/cart/items`, {
    method: 'DELETE',
    headers: { authorization: headers.authorization }
  });
  assert.equal(clearResponse.status, 204);
  const cartResponse = await fetch(`${baseUrl}/cart`, {
    headers: { authorization: headers.authorization }
  });
  assert.deepEqual((await cartResponse.json()).data, {
    items: [],
    total: 0,
    hasUnavailableItems: false
  });
});
