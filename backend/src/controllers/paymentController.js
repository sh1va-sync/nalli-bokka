import { createHmac, timingSafeEqual } from 'node:crypto';
import Order from '../models/Order.js';
import Transaction from '../models/Transaction.js';
import WebhookEvent from '../models/WebhookEvent.js';
import getRazorpayClient from '../services/razorpay.js';
import AppError from '../utils/AppError.js';

async function settleTransaction(transaction, status, paymentId, session = null) {
  // Load order in the same session when available
  const order = await Order.findById(transaction.orderId).session(session);
  if (!order) {
    throw new AppError(404, 'Payment order no longer exists');
  }

  // Idempotent: if transaction already marked paid, nothing to do
  if (transaction.status === 'paid') {
    return transaction;
  }

  // Update transaction and order atomically when session is provided
  if (session) {
    await Transaction.updateOne({ _id: transaction._id }, {
      $set: { status, paymentId: paymentId || transaction.paymentId, timestamp: new Date() }
    }, { session });
    if (order.paymentStatus !== 'paid') {
      await Order.updateOne({ _id: order._id }, { $set: { paymentStatus: status === 'paid' ? 'paid' : 'failed' } }, { session });
    }
    // Reload transaction
    const updated = await Transaction.findById(transaction._id).session(session);
    return updated;
  }

  transaction.status = status;
  if (paymentId) {
    transaction.paymentId = paymentId;
  }
  transaction.timestamp = new Date();
  await transaction.save();

  if (order.paymentStatus !== 'paid') {
    order.paymentStatus = status === 'paid' ? 'paid' : 'failed';
    await order.save();
  }
  return transaction;
}

export async function createPaymentOrder(req, res) {
  const order = await Order.findOne({
    _id: req.validated.params.orderId,
    userId: req.auth.id
  });
  if (!order) {
    throw new AppError(404, 'Order not found');
  }
  if (order.orderStatus === 'cancelled' || order.paymentStatus === 'paid') {
    throw new AppError(409, 'Payment cannot be started for this order');
  }
  if (order.totalAmount <= 0) {
    throw new AppError(400, 'Order total must be greater than zero');
  }
  const razorpay = getRazorpayClient();

  let transaction = await Transaction.findOne({ orderId: order._id, status: 'created' });
  if (!transaction) {
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(order.totalAmount * 100),
      currency: 'INR',
      receipt: `NB${order._id}`,
      notes: { orderId: String(order._id), userId: String(req.auth.id) }
    });
    transaction = await Transaction.create({
      orderId: order._id,
      razorpayOrderId: razorpayOrder.id,
      amount: order.totalAmount,
      status: 'created'
    });
  }
  if (order.paymentStatus !== 'pending') {
    order.paymentStatus = 'pending';
    await order.save();
  }

  res.status(201).json({
    data: {
      transactionId: transaction._id,
      razorpayOrderId: transaction.razorpayOrderId,
      keyId: process.env.RAZORPAY_KEY_ID,
      amount: Math.round(transaction.amount * 100),
      currency: 'INR'
    }
  });
}

export async function verifyPayment(req, res) {
  const { razorpayOrderId, paymentId, signature } = req.validated.body;
  const transaction = await Transaction.findOne({ razorpayOrderId });
  if (!transaction) {
    throw new AppError(404, 'Payment transaction not found');
  }

  const order = await Order.findOne({ _id: transaction.orderId, userId: req.auth.id });
  if (!order) {
    throw new AppError(404, 'Order not found');
  }

  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    throw new AppError(503, 'Online payments are not configured');
  }

  const expected = createHmac('sha256', secret)
    .update(`${razorpayOrderId}|${paymentId}`)
    .digest();
  const supplied = Buffer.from(signature, 'hex');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new AppError(400, 'Payment signature is invalid');
  }

  const payment = await getRazorpayClient().payments.fetch(paymentId);
  if (
    payment.order_id !== razorpayOrderId
    || payment.amount !== Math.round(transaction.amount * 100)
    || payment.currency !== 'INR'
    || payment.status !== 'captured'
  ) {
    throw new AppError(409, 'Payment is not captured for the expected amount and order');
  }

  // Update DB atomically if possible to avoid race between client and webhook
  const session = await Transaction.db.startSession();
  try {
    session.startTransaction();
    await settleTransaction(transaction, 'paid', paymentId, session);
    await session.commitTransaction();
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }

  res.json({ data: { orderId: order._id, paymentStatus: 'paid' } });
}

export async function handleRazorpayWebhook(req, res) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new AppError(503, 'Payment webhooks are not configured');
  }
  if (!Buffer.isBuffer(req.body)) {
    throw new AppError(400, 'Webhook body must be JSON');
  }

  const signature = req.get('x-razorpay-signature') || '';
  const expected = createHmac('sha256', secret).update(req.body).digest();
  let supplied;
  try {
    supplied = Buffer.from(signature, 'hex');
  } catch {
    throw new AppError(400, 'Invalid webhook signature');
  }
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new AppError(400, 'Invalid webhook signature');
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    throw new AppError(400, 'Invalid webhook payload');
  }

  if (!['payment.captured', 'payment.failed'].includes(event.event)) {
    return res.status(200).json({ received: true });
  }

  const payment = event.payload?.payment?.entity;
  if (!payment?.order_id || !payment.id) {
    throw new AppError(400, 'Webhook is missing payment details');
  }
  const transaction = await Transaction.findOne({ razorpayOrderId: payment.order_id });
  if (!transaction) {
    throw new AppError(404, 'Payment transaction not found');
  }
  if (payment.amount !== Math.round(transaction.amount * 100) || payment.currency !== 'INR') {
    throw new AppError(409, 'Webhook payment amount does not match the transaction');
  }

  const status = event.event === 'payment.captured' ? 'paid' : 'failed';

  // Persist and deduplicate webhook events so duplicate deliveries won't reprocess
  let inserted = false;
  try {
    await WebhookEvent.create({ razorpayEventId: payment.id });
    inserted = true;
  } catch (e) {
    if (e.code === 11000) {
      const existing = await WebhookEvent.findOne({ razorpayEventId: payment.id });
      if (existing && existing.processed) {
        // already processed
        return res.status(200).json({ received: true });
      }
      // else proceed to try processing once
    } else {
      console.error('Failed to persist webhook event', e);
      return res.status(500).json({ error: 'internal error' });
    }
  }

  // Use a transaction/session to update transaction + order atomically if supported
  const session = await Transaction.db.startSession();
  try {
    session.startTransaction();
    await settleTransaction(transaction, status, payment.id, session);
    await WebhookEvent.updateOne({ razorpayEventId: payment.id }, { $set: { processed: true, processedAt: new Date() } }, { session });
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    console.error('Error settling transaction from webhook', err);
    return res.status(500).json({ error: 'processing failed' });
  } finally {
    session.endSession();
  }

  res.status(200).json({ received: true });
}
