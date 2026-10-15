import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';
import AuditEvent from '../src/models/AuditEvent.js';
import Cart from '../src/models/Cart.js';
import CheckoutAttempt from '../src/models/CheckoutAttempt.js';
import IdempotencyKey from '../src/models/IdempotencyKey.js';
import Order from '../src/models/Order.js';
import Notification from '../src/models/Notification.js';
import Product from '../src/models/Product.js';
import ProductCategory from '../src/models/ProductCategory.js';
import Store from '../src/models/Store.js';
import Transaction from '../src/models/Transaction.js';
import User from '../src/models/User.js';
import WebhookEvent from '../src/models/WebhookEvent.js';
import { priceSelection } from '../src/utils/pricing.js';
import { getIndiaDateString, getPickupSlots, isValidPickupTime } from '../src/utils/pickupSlots.js';

const objectId = () => new mongoose.Types.ObjectId();

test('all twelve Mongoose models use their intended collections', () => {
  assert.deepEqual(
    [Store, User, Product, ProductCategory, Cart, Order, Transaction, CheckoutAttempt, IdempotencyKey, WebhookEvent, Notification, AuditEvent]
      .map(model => model.collection.collectionName),
    ['stores', 'users', 'products', 'productcategories', 'carts', 'orders', 'transactions', 'checkoutattempts', 'idempotencykeys', 'webhookevents', 'notifications', 'auditevents']
  );
});

test('store audit events keep only action metadata and expire after one year', async () => {
  const event = new AuditEvent({
    actorId: objectId(),
    actorRole: 'store',
    action: 'product.stock_updated',
    entityType: 'product',
    entityId: objectId(),
    previousState: 'true',
    nextState: 'false',
    changedFields: ['inStock'],
    requestId: 'request-id'
  });
  await event.validate();
  await new AuditEvent({
    actorId: objectId(),
    actorRole: 'store',
    action: 'product.category.created',
    entityType: 'productCategory',
    entityId: objectId(),
    changedFields: ['name']
  }).validate();
  assert.equal(AuditEvent.schema.path('phone'), undefined);
  assert.ok(AuditEvent.schema.indexes().some(([fields, options]) => (
    fields.createdAt === 1 && options.expireAfterSeconds === 60 * 60 * 24 * 365
  )));
});

test('store password is excluded from normal queries and JSON serialization', () => {
  const store = new Store({
    storeName: 'Nalli Bokka',
    username: 'nalli',
    password: 'long-enough-password',
    location: 'Hyderabad'
  });
  assert.equal(Store.schema.path('password').options.select, false);
  assert.equal(JSON.stringify(store).includes('password'), false);
});

test('store contact numbers are optional and length bounded', async () => {
  await new Store({
    storeName: 'Nalli Bokka',
    username: 'nalli',
    password: 'long-enough-password',
    location: 'Hyderabad',
    storePhone: '+911234567890'
  }).validate();
  await assert.rejects(new Store({
    storeName: 'Nalli Bokka',
    username: 'nalli',
    password: 'long-enough-password',
    location: 'Hyderabad',
    storePhone: '1'.repeat(31)
  }).validate(), /storePhone/);
});

test('order notifications are user-scoped, unread by default, and unique per order status', async () => {
  const notification = new Notification({
    userId: objectId(),
    orderId: objectId(),
    orderStatus: 'placed',
    title: 'Order placed',
    message: 'Payment was successful and your order is confirmed.'
  });
  await notification.validate();
  assert.equal(notification.readAt, null);
  assert.ok(Notification.schema.indexes().some(([fields, options]) => (
    fields.orderId === 1 && fields.orderStatus === 1 && options.unique
  )));
});

test('product validation enforces weight and pack pricing modes', async () => {
  await new Product({
    storeId: objectId(),
    productType: 'meat',
    productName: 'Mutton',
    imageUrl: 'https://example.test/mutton.jpg',
    pricePerKg: 800
  }).validate();
  await new Product({
    storeId: objectId(),
    productType: 'oil',
    productName: 'Oil',
    imageUrl: 'https://example.test/oil.jpg',
    packs: [{ label: '5 L', price: 850 }]
  }).validate();
  await new Product({
    storeId: objectId(),
    productType: 'oil',
    pricingMode: 'weight',
    productName: 'Custom-priced oil',
    imageUrl: 'https://example.test/oil.jpg',
    pricePerKg: 250
  }).validate();
  await new Product({
    storeId: objectId(),
    productType: 'meat',
    pricingMode: 'pack',
    productName: 'Packaged meat',
    imageUrl: 'https://example.test/meat.jpg',
    packs: [{ label: '500 g', price: 450 }]
  }).validate();
  await new Product({
    storeId: objectId(),
    productType: 'rice',
    productName: 'Loose rice',
    imageUrl: 'https://example.test/rice.jpg',
    pricePerKg: 60
  }).validate();
  await new Product({
    storeId: objectId(),
    productType: 'rice',
    productName: 'Packed rice',
    imageUrl: 'https://example.test/packed-rice.jpg',
    packs: [{ label: '5 kg', price: 280 }]
  }).validate();
  await new Product({
    storeId: objectId(),
    productType: 'rice',
    pricingMode: 'pack',
    productName: 'Explicit packaged rice',
    imageUrl: 'https://example.test/rice-pack.jpg',
    packs: [{ label: '2 kg', price: 140 }]
  }).validate();
  await assert.rejects(new Product({
    storeId: objectId(),
    productType: 'oil',
    productName: 'Invalid oil',
    imageUrl: 'https://example.test/oil.jpg',
    pricePerKg: 10
  }).validate());
  await assert.rejects(new Product({
    storeId: objectId(),
    productType: 'oil',
    productName: 'Duplicate pack oil',
    imageUrl: 'https://example.test/oil.jpg',
    packs: [{ label: '1 L', price: 10 }, { label: '1 L', price: 9 }]
  }).validate());
  await new Product({
    storeId: objectId(),
    productType: 'dry fruits',
    pricingMode: 'weight',
    productName: 'Almonds',
    imageUrl: 'https://example.test/almonds.jpg',
    pricePerKg: 900
  }).validate();
  await new Product({
    storeId: objectId(),
    productType: 'dry fruits',
    pricingMode: 'pack',
    productName: 'Walnuts',
    imageUrl: 'https://example.test/walnuts.jpg',
    packs: [{ label: '250 g', price: 200 }]
  }).validate();
  await assert.rejects(new Product({
    storeId: objectId(),
    productType: 'dry fruits',
    productName: 'Unconfigured product',
    imageUrl: 'https://example.test/product.jpg',
    pricePerKg: 100
  }).validate());
  assert.ok(ProductCategory.schema.indexes().some(([fields, options]) => (
    fields.storeId === 1 && fields.normalizedName === 1 && options.unique
  )));
});

test('server recalculates weight, piece, and pack prices', () => {
  const mutton = {
    productType: 'meat',
    productName: 'Mutton',
    inStock: true,
    pricePerKg: 800,
    pieceWeightGrams: 250,
    packs: []
  };
  assert.equal(priceSelection(mutton, 'weight', 0.5).lineTotal, 400);
  assert.equal(priceSelection(mutton, 'pieces', 2).lineTotal, 400);
  assert.equal(priceSelection({
    productType: 'meat',
    pricingMode: 'pack',
    productName: 'Packaged meat',
    inStock: true,
    packs: [{ label: '500 g', price: 450 }]
  }, 'pack', 1, '500 g').lineTotal, 450);
  assert.equal(priceSelection({
    productType: 'oil',
    pricingMode: 'weight',
    productName: 'Oil',
    inStock: true,
    pricePerKg: 250
  }, 'weight', 2).lineTotal, 500);
  assert.equal(priceSelection({
    productType: 'dry fruits',
    pricingMode: 'weight',
    productName: 'Almonds',
    inStock: true,
    pricePerKg: 900
  }, 'weight', 0.25).lineTotal, 225);

  const oil = {
    productType: 'oil',
    productName: 'Oil',
    inStock: true,
    packs: [{ label: '5 L', price: 850 }]
  };
  assert.equal(priceSelection(oil, 'pack', 2, '5 L').lineTotal, 1700);
  assert.equal(priceSelection({
    productType: 'dry fruits',
    pricingMode: 'pack',
    productName: 'Walnuts',
    inStock: true,
    packs: [{ label: '250 g', price: 200 }]
  }, 'pack', 2, '250 g').lineTotal, 400);
});

test('cart does not store a total and order total is derived from snapshot line prices', async () => {
  assert.equal(Cart.schema.path('total'), undefined);
  const cart = new Cart({
    userId: objectId(),
    items: [{
      productId: objectId(),
      selectionType: 'pack',
      selectedQuantity: 1,
      selectedPackLabel: '1 L'
    }]
  });

  assert.ok(cart.items[0]._id);
  assert.equal(cart.items.id(String(cart.items[0]._id)), cart.items[0]);

  const order = new Order({
    userId: objectId(),
    storeId: objectId(),
    deliveryAddress: {
      label: 'Home',
      fullAddress: '1 Example Road',
      pincode: '500001'
    },
    items: [
      {
        productId: objectId(),
        productName: 'Mutton',
        selectionType: 'weight',
        quantity: 0.5,
        price: 400
      },
      {
        productId: objectId(),
        productName: 'Oil',
        selectionType: 'pack',
        quantity: 1,
        packLabel: '1 L',
        price: 100
      }
    ]
  });
  await order.validate();
  assert.equal(order.totalAmount, 500);
});

test('pickup slots are 30-minute future windows within store hours in India time', () => {
  const now = new Date('2026-10-15T10:00:00.000Z');
  const date = getIndiaDateString(now);
  const slots = getPickupSlots({
    date,
    openingTime: '16:00',
    closingTime: '18:00',
    now
  });
  assert.equal(slots.length, 4);
  assert.equal(slots[0].startAt.toISOString(), '2026-10-15T10:30:00.000Z');
  assert.equal(slots.at(-1).endAt.toISOString(), '2026-10-15T12:30:00.000Z');
  assert.equal(isValidPickupTime({
    pickupAt: slots[0].startAt,
    openingTime: '16:00',
    closingTime: '18:00',
    now
  }), true);
  assert.equal(isValidPickupTime({
    pickupAt: '2026-10-15T10:15:00.000Z',
    openingTime: '16:00',
    closingTime: '18:00',
    now
  }), false);
  assert.deepEqual(getPickupSlots({
    date: '2026-02-30',
    openingTime: '09:00',
    closingTime: '10:00',
    now
  }), []);
});
