import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';
import Cart from '../src/models/Cart.js';
import IdempotencyKey from '../src/models/IdempotencyKey.js';
import Order from '../src/models/Order.js';
import Notification from '../src/models/Notification.js';
import Product from '../src/models/Product.js';
import Store from '../src/models/Store.js';
import Transaction from '../src/models/Transaction.js';
import User from '../src/models/User.js';
import WebhookEvent from '../src/models/WebhookEvent.js';
import { priceSelection } from '../src/utils/pricing.js';

const objectId = () => new mongoose.Types.ObjectId();

test('all nine Mongoose models use their intended collections', () => {
  assert.deepEqual(
    [Store, User, Product, Cart, Order, Transaction, IdempotencyKey, WebhookEvent, Notification]
      .map(model => model.collection.collectionName),
    ['stores', 'users', 'products', 'carts', 'orders', 'transactions', 'idempotencykeys', 'webhookevents', 'notifications']
  );
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

test('order notifications are user-scoped, unread by default, and unique per order status', async () => {
  const notification = new Notification({
    userId: objectId(),
    orderId: objectId(),
    orderStatus: 'packing',
    title: 'Order status updated',
    message: 'Your order is being prepared.'
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

  const oil = {
    productType: 'oil',
    productName: 'Oil',
    inStock: true,
    packs: [{ label: '5 L', price: 850 }]
  };
  assert.equal(priceSelection(oil, 'pack', 2, '5 L').lineTotal, 1700);
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
