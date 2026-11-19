import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../src/app.js';
import CheckoutAttempt from '../src/models/CheckoutAttempt.js';
import Order from '../src/models/Order.js';
import Transaction from '../src/models/Transaction.js';
import RevokedToken from '../src/models/RevokedToken.js';
import Store from '../src/models/Store.js';
import { removeCheckoutTtl } from '../src/config/database.js';
import MongoRateLimitStore from '../src/services/mongoRateLimitStore.js';
import { completeCheckoutAttempt } from '../src/controllers/paymentController.js';
import { reconcilePayment, reconcileRefund, reconciliationRecords } from '../scripts/reconcilePaymentState.js';

let replicaSet, server, baseUrl;
before(async () => {
  process.env.JWT_SECRET = 'recovery-test-secret-longer-than-32-characters';
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replicaSet.getUri());
  await Promise.all([CheckoutAttempt, Order, Transaction, RevokedToken].map(model => model.init()));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await mongoose.disconnect();
  if (replicaSet) await replicaSet.stop();
});

function attemptData(index) {
  return {
    userId: new mongoose.Types.ObjectId(), storeId: new mongoose.Types.ObjectId(),
    orderType: 'delivery', deliveryAddress: { label: 'Home', fullAddress: '12 Example Road', pincode: '500001' },
    items: [{ productId: new mongoose.Types.ObjectId(), productName: 'Milk', selectionType: 'pack', quantity: 1, packLabel: '1 litre', price: 25 }],
    amount: 25, idempotencyKey: `recovery-${index}`, razorpayOrderId: `order_recovery_${index}`,
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000)
  };
}

test('checkout evidence survives past one day and still settles after a browser failure', async () => {
  assert.equal((await CheckoutAttempt.collection.indexes()).some(index => index.expireAfterSeconds !== undefined), false);
  const attempt = await CheckoutAttempt.create({ ...attemptData('old'), status: 'failed' });
  const provider = { orders: {
    fetch: async () => ({ amount: 2500, currency: 'INR' }),
    fetchPayments: async () => ({ items: [{ id: 'pay_delayed', order_id: attempt.razorpayOrderId, amount: 2500, currency: 'INR', status: 'captured' }] })
  } };
  assert.equal(await reconcilePayment(attempt, 'checkoutAttempt', provider), 'paid');
  const paid = await CheckoutAttempt.findById(attempt._id);
  assert.equal(paid.status, 'paid');
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => assert.equal(String(await completeCheckoutAttempt(attempt._id, 'pay_delayed', session)), String(paid.orderId)));
  } finally { await session.endSession(); }
  assert.equal(await Transaction.countDocuments({ paymentId: 'pay_delayed' }), 1);
});

test('startup migration removes only the obsolete checkout TTL and can run twice', async () => {
  await CheckoutAttempt.collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 });
  await removeCheckoutTtl(mongoose.connection);
  await removeCheckoutTtl(mongoose.connection);
  const indexes = await CheckoutAttempt.collection.indexes();
  assert.equal(indexes.some(index => index.expireAfterSeconds !== undefined), false);
  assert.ok(indexes.some(index => index.unique && index.key.razorpayOrderId === 1));
});

test('reconciliation scans past 100 unresolved records without starvation', async () => {
  await CheckoutAttempt.insertMany(Array.from({ length: 105 }, (_, i) => attemptData(i)));
  let count = 0;
  for await (const record of reconciliationRecords(CheckoutAttempt, { status: 'pending' })) {
    assert.ok(record.razorpayOrderId);
    count += 1;
  }
  assert.equal(count, 105);
});

test('refund reservation survives interrupted dispatch and reuses its idempotency key', async () => {
  const order = await Order.create({
    ...attemptData('refund'), totalAmount: 25, paymentStatus: 'refund_pending', orderStatus: 'cancelled'
  });
  const transaction = await Transaction.create({
    orderId: order._id, razorpayOrderId: 'order_refund_recovery', paymentId: 'pay_refund_recovery', amount: 25,
    status: 'paid', refundStatus: 'pending', refundIdempotent: true, refundRequestId: 'refund-recovery-key-12345', refundRequestedAt: new Date()
  });
  const keys = [];
  let loseResponse = true;
  const provider = { payments: {
    fetchMultipleRefund: async () => ({ items: [] }),
    refundIdempotent: async (paymentId, body, key) => {
      keys.push(key);
      assert.deepEqual(body, { amount: 2500, notes: { refundRequestId: transaction.refundRequestId } });
      if (loseResponse) { loseResponse = false; throw new Error('connection lost'); }
      return { id: 'rfnd_recovered', payment_id: paymentId, amount: 2500, status: 'processed' };
    }
  } };
  await assert.rejects(reconcileRefund(transaction, provider), /remains pending/);
  assert.equal((await Transaction.findById(transaction._id)).refundStatus, 'pending');
  assert.equal(await reconcileRefund(transaction, provider), 'processed');
  assert.deepEqual(keys, [transaction.refundRequestId, transaction.refundRequestId]);
  assert.equal((await Order.findById(order._id)).paymentStatus, 'refunded');
  await assert.rejects(reconcileRefund({ paymentId: 'legacy', refundRequestId: 'old' }, provider), /operator investigation/);
});

test('rate-limit counters are shared across store instances and concurrent requests', async () => {
  const first = new MongoRateLimitStore('recovery-test');
  const second = new MongoRateLimitStore('recovery-test');
  first.init({ windowMs: 3600000 }); second.init({ windowMs: 3600000 });
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? first : second).increment('customer')));
  assert.deepEqual(results.map(result => result.totalHits).sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
  assert.equal((await second.increment('customer')).totalHits, 21);
});

test('logout revokes a token across requests and tokens older than an hour are rejected', async () => {
  const token = jwt.sign({ role: 'user', sessionStartedAt: Date.now() }, process.env.JWT_SECRET, {
    subject: String(new mongoose.Types.ObjectId()), jwtid: 'recovery-session', issuer: 'nalli-bokka-api', expiresIn: '1h'
  });
  const headers = { authorization: `Bearer ${token}` };
  assert.equal((await fetch(`${baseUrl}/auth/logout`, { method: 'POST', headers })).status, 204);
  assert.equal((await fetch(`${baseUrl}/auth/logout`, { method: 'POST', headers })).status, 401);
  const old = jwt.sign({ role: 'user', iat: Math.floor(Date.now() / 1000) - 7200 }, process.env.JWT_SECRET, {
    subject: String(new mongoose.Types.ObjectId()), issuer: 'nalli-bokka-api', expiresIn: '7d'
  });
  assert.equal((await fetch(`${baseUrl}/auth/me`, { headers: { authorization: `Bearer ${old}` } })).status, 401);
});

test('changing a store password revokes previously issued sessions', async () => {
  const store = await Store.create({ storeName: 'Session test', username: 'session-test', password: 'old-password-123', location: 'Hyderabad' });
  const headers = { 'content-type': 'application/json' };
  const login = await fetch(`${baseUrl}/auth/stores/login`, { method: 'POST', headers, body: JSON.stringify({ username: store.username, password: 'old-password-123' }) });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  const claims = jwt.decode(token);
  assert.equal(claims.exp - claims.iat, 3600);
  store.password = 'new-password-123';
  await store.save();
  assert.equal((await fetch(`${baseUrl}/auth/me`, { headers: { authorization: `Bearer ${token}` } })).status, 401);
});
