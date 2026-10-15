import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHmac } from 'node:crypto';
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

const originalEnvironment = {
  JWT_SECRET: process.env.JWT_SECRET,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET
};
let replicaSet;
let server;
let baseUrl;
let razorpayOrderSequence = 0;
let capturedRazorpayOrderId;

before(async () => {
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-integration-tests';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = 'test-razorpay-secret';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'test-webhook-secret';
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
    'content-type': 'application/json'
  };

  const categoryResponse = await fetch(`${baseUrl}/store/product-categories`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Pet Supplies' })
  });
  assert.equal(categoryResponse.status, 201);
  assert.deepEqual((await categoryResponse.json()).data, { name: 'pet supplies' });

  const productResponse = await fetch(`${baseUrl}/store/products`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      productType: 'pet supplies',
      pricingMode: 'pack',
      productName: 'Dog Food',
      imageUrl: 'https://example.test/dog-food.jpg',
      packs: [{ label: '2 kg', price: 500 }]
    })
  });
  assert.equal(productResponse.status, 201);
  const product = (await productResponse.json()).data;
  assert.equal(product.productType, 'pet supplies');
  assert.equal(product.pricingMode, 'pack');

  const existingCategoryProductResponse = await fetch(`${baseUrl}/store/products`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      productType: 'meat',
      pricingMode: 'pack',
      productName: 'Packaged Mutton',
      imageUrl: 'https://example.test/packaged-mutton.jpg',
      packs: [{ label: '500 g', price: 450 }]
    })
  });
  assert.equal(existingCategoryProductResponse.status, 201);
  assert.equal((await existingCategoryProductResponse.json()).data.pricingMode, 'pack');

  const inventoryResponse = await fetch(`${baseUrl}/store/products?productType=pet%20supplies&inStock=true&pricingMode=pack`, {
    headers: { authorization: headers.authorization }
  });
  assert.equal(inventoryResponse.status, 200);
  assert.equal((await inventoryResponse.json()).data[0]._id, product._id);

  const publicCategoriesResponse = await fetch(`${baseUrl}/products/categories`);
  assert.equal(publicCategoriesResponse.status, 200);
  assert.ok((await publicCategoriesResponse.json()).data.includes('pet supplies'));

  const duplicateResponse = await fetch(`${baseUrl}/store/product-categories`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'PET SUPPLIES' })
  });
  assert.equal(duplicateResponse.status, 409);
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
