import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import Notification from '../models/Notification.js';
import Order from '../models/Order.js';
import Transaction from '../models/Transaction.js';
import WebhookEvent from '../models/WebhookEvent.js';
import getRazorpayClient from '../services/razorpay.js';
import AppError from '../utils/AppError.js';

async function applyRefundResult(transactionId, requestId, refund, refundStatus, activeSession = null) {
  const session = activeSession || await Transaction.db.startSession();
  let applied = false;
  try {
    const apply = async () => {
      const transaction = await Transaction.findOne({
        _id: transactionId,
        refundRequestId: requestId,
        refundStatus: 'pending'
      }).session(session);
      if (!transaction) {
        return;
      }

      if (refundStatus === 'pending') {
        if (refund.id) {
          if (transaction.refundId && transaction.refundId !== refund.id) {
            throw new AppError(409, 'Refund webhook ID does not match the pending refund');
          }
          transaction.refundId = refund.id;
          await transaction.save({ session });
        }
        return;
      }

      const order = await Order.findById(transaction.orderId).session(session);
      if (!order || order.paymentStatus !== 'refund_pending') {
        throw new AppError(409, 'Order and refund state are inconsistent');
      }

      transaction.refundStatus = refundStatus;
      transaction.refundId = refund.id || transaction.refundId;
      transaction.timestamp = new Date();
      await transaction.save({ session });

      if (refundStatus === 'processed') {
        order.paymentStatus = 'refunded';
        order.orderStatus = 'cancelled';
        await order.save({ session });
        await Notification.create([{
          userId: order.userId,
          orderId: order._id,
          orderStatus: 'cancelled',
          title: 'Order refund processed',
          message: 'Your full refund has been processed and the order was cancelled.'
        }], { session });
      } else {
        order.paymentStatus = 'refund_failed';
        await order.save({ session });
      }
      applied = true;
    };
    if (activeSession) {
      await apply();
    } else {
      await session.withTransaction(apply);
    }
  } finally {
    if (!activeSession) await session.endSession();
  }
  return applied;
}

function refundResponse(transaction, orderId) {
  return {
    orderId,
    refundStatus: transaction.refundStatus,
    refundId: transaction.refundId,
    paymentStatus: transaction.refundStatus === 'processed'
      ? 'refunded'
      : transaction.refundStatus === 'failed'
        ? 'refund_failed'
        : 'refund_pending'
  };
}

export async function refundStoreOrder(req, res) {
  const razorpay = getRazorpayClient();
  const session = await Transaction.db.startSession();
  const requestId = randomUUID();
  let reservation;
  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({
        _id: req.validated.params.orderId,
        storeId: req.auth.id
      }).session(session);
      if (!order) {
        throw new AppError(404, 'Order not found');
      }

      if (['refund_pending', 'refunded', 'refund_failed'].includes(order.paymentStatus)) {
        const transaction = await Transaction.findOne({ orderId: order._id })
          .sort({ timestamp: -1 })
          .session(session);
        if (!transaction || (transaction.refundStatus || 'none') === 'none') {
          throw new AppError(409, 'Refund state is inconsistent; contact support');
        }
        reservation = { transaction, existing: true };
        return;
      }

      if (!['placed', 'packing'].includes(order.orderStatus)) {
        throw new AppError(409, 'Only placed or packing orders can be refunded');
      }
      if (order.paymentStatus !== 'paid') {
        throw new AppError(409, 'Only paid orders can be refunded');
      }

      const transaction = await Transaction.findOne({
        orderId: order._id,
        status: 'paid',
        paymentId: { $exists: true }
      }).sort({ timestamp: -1 }).session(session);
      if (!transaction) {
        throw new AppError(409, 'A captured payment transaction was not found');
      }
      if (transaction.refundStatus && transaction.refundStatus !== 'none') {
        reservation = { transaction, existing: true };
        return;
      }

      const reserved = await Transaction.updateOne({
        _id: transaction._id,
        status: 'paid',
        $or: [{ refundStatus: 'none' }, { refundStatus: { $exists: false } }]
      }, {
        $set: {
          refundStatus: 'pending',
          refundRequestId: requestId,
          timestamp: new Date()
        }
      }, { session });
      if (!reserved.modifiedCount) {
        const current = await Transaction.findById(transaction._id).session(session);
        reservation = { transaction: current, existing: true };
        return;
      }

      order.paymentStatus = 'refund_pending';
      await order.save({ session });
      transaction.refundStatus = 'pending';
      transaction.refundRequestId = requestId;
      reservation = { transaction, existing: false };
    });
  } finally {
    await session.endSession();
  }

  if (reservation.existing) {
    const response = refundResponse(reservation.transaction, reservation.transaction.orderId);
    return res.status(response.refundStatus === 'pending' ? 202 : 200).json({ data: response });
  }

  const { transaction } = reservation;
  const amount = Math.round(transaction.amount * 100);
  let refund;
  try {
    refund = await razorpay.payments.refund(transaction.paymentId, {
      amount,
      notes: { refundRequestId: transaction.refundRequestId }
    });
  } catch {
    throw new AppError(502, 'Refund request could not be confirmed; its status is pending and must not be retried');
  }

  if (
    !refund?.id
    || refund.payment_id !== transaction.paymentId
    || refund.amount !== amount
    || !['created', 'pending', 'processed', 'failed'].includes(refund.status)
  ) {
    throw new AppError(502, 'Razorpay returned an invalid refund response; refund status remains pending');
  }

  const refundStatus = refund.status === 'processed'
    ? 'processed'
    : refund.status === 'failed'
      ? 'failed'
      : 'pending';
  await applyRefundResult(transaction._id, transaction.refundRequestId, refund, refundStatus);
  const updatedTransaction = await Transaction.findById(transaction._id);
  const response = refundResponse(updatedTransaction, transaction.orderId);
  return res.status(response.refundStatus === 'pending' ? 202 : 200).json({ data: response });
}

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
  if (
    order.orderStatus === 'cancelled'
    || !['pending', 'failed'].includes(order.paymentStatus)
  ) {
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

  if (!['payment.captured', 'payment.failed', 'refund.processed', 'refund.failed'].includes(event.event)) {
    return res.status(200).json({ received: true });
  }

  const razorpayEventId = req.get('x-razorpay-event-id');
  if (!razorpayEventId) {
    throw new AppError(400, 'Webhook event ID is missing');
  }

  // Persist and deduplicate webhook events so duplicate deliveries won't reprocess
  try {
    await WebhookEvent.create({ razorpayEventId });
  } catch (e) {
    if (e.code === 11000) {
      const existing = await WebhookEvent.findOne({ razorpayEventId });
      if (existing && existing.processed) {
        // already processed
        return res.status(200).json({ received: true });
      }
      // else proceed to try processing once
    } else {
      throw e;
    }
  }

  // Use a transaction/session to update transaction + order atomically if supported
  const session = await Transaction.db.startSession();
  try {
    session.startTransaction();
    if (event.event.startsWith('refund.')) {
      const refund = event.payload?.refund?.entity;
      if (!refund?.id || !refund.payment_id || !refund.notes?.refundRequestId) {
        throw new AppError(400, 'Refund webhook is missing refund details');
      }
      const requestId = refund.notes.refundRequestId;
      const transaction = await Transaction.findOne({
        paymentId: refund.payment_id,
        refundRequestId: requestId
      }).session(session);
      if (!transaction) {
        throw new AppError(404, 'Refund does not match a locally requested refund');
      }
      if (refund.amount !== Math.round(transaction.amount * 100) || refund.currency !== 'INR') {
        throw new AppError(409, 'Webhook refund amount or currency does not match the transaction');
      }
      const refundStatus = event.event === 'refund.processed' ? 'processed' : 'failed';
      await applyRefundResult(transaction._id, requestId, refund, refundStatus, session);
    } else {
      const payment = event.payload?.payment?.entity;
      if (!payment?.order_id || !payment.id) {
        throw new AppError(400, 'Webhook is missing payment details');
      }
      const transaction = await Transaction.findOne({ razorpayOrderId: payment.order_id }).session(session);
      if (!transaction) {
        throw new AppError(404, 'Payment transaction not found');
      }
      if (payment.amount !== Math.round(transaction.amount * 100) || payment.currency !== 'INR') {
        throw new AppError(409, 'Webhook payment amount does not match the transaction');
      }
      const status = event.event === 'payment.captured' ? 'paid' : 'failed';
      await settleTransaction(transaction, status, payment.id, session);
    }
    await WebhookEvent.updateOne({ razorpayEventId }, { $set: { processed: true, processedAt: new Date() } }, { session });
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  res.status(200).json({ received: true });
}
