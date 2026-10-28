import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import Cart from '../models/Cart.js';
import CheckoutAttempt from '../models/CheckoutAttempt.js';
import Notification from '../models/Notification.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Store from '../models/Store.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import WebhookEvent from '../models/WebhookEvent.js';
import { recordStoreAudit } from '../services/audit.js';
import { isValidPickupTime } from '../utils/pickupSlots.js';
import getRazorpayClient from '../services/razorpay.js';
import AppError from '../utils/AppError.js';
import { priceSelection, roundToPaise } from '../utils/pricing.js';

async function setRefundNotification(order, title, message, session) {
  await Notification.findOneAndUpdate(
    { orderId: order._id, orderStatus: 'cancelled' },
    {
      $set: { title, message },
      $setOnInsert: {
        userId: order.userId,
        orderId: order._id,
        orderStatus: 'cancelled'
      }
    },
    { upsert: true, session }
  );
}

export async function applyRefundResult(transactionId, requestId, refund, refundStatus, activeSession = null) {
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
        await setRefundNotification(
          order,
          'Order refund processed',
          'Your order was cancelled and your full refund has been processed.',
          session
        );
      } else {
        order.paymentStatus = 'refund_failed';
        await order.save({ session });
        await setRefundNotification(
          order,
          'Refund needs attention',
          'Your order was cancelled, but the full refund could not be completed. Please contact the store for assistance.',
          session
        );
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
        if (transaction.refundStatus === 'pending' && order.orderStatus !== 'cancelled') {
          order.orderStatus = 'cancelled';
          await order.save({ session });
          await setRefundNotification(
            order,
            'Order cancelled',
            'The store cancelled your order and requested a full refund. Refund processing is pending.',
            session
          );
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
          refundRequestedAt: new Date(),
          timestamp: new Date()
        }
      }, { session });
      if (!reserved.modifiedCount) {
        const current = await Transaction.findById(transaction._id).session(session);
        reservation = { transaction: current, existing: true };
        return;
      }

      order.paymentStatus = 'refund_pending';
      order.orderStatus = 'cancelled';
      await order.save({ session });
      await recordStoreAudit({
        session,
        req,
        action: 'order.refund_requested',
        entityType: 'order',
        entityId: order._id,
        previousState: 'paid',
        nextState: 'refund_pending/cancelled',
        changedFields: ['paymentStatus', 'orderStatus']
      });
      await setRefundNotification(
        order,
        'Order cancelled',
        'The store cancelled your order and requested a full refund. Refund processing is pending.',
        session
      );
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
    throw new AppError(502, 'The order was cancelled, but the refund status could not be confirmed. The refund remains pending; do not retry it.');
  }

  if (
    !refund?.id
    || refund.payment_id !== transaction.paymentId
    || refund.amount !== amount
    || !['created', 'pending', 'processed', 'failed'].includes(refund.status)
  ) {
    throw new AppError(502, 'The order was cancelled, but Razorpay returned an invalid refund response. The refund remains pending; do not retry it.');
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

export async function settleTransaction(transaction, status, paymentId, session = null) {
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

function razorpayPaymentData(attempt, returnOrigin) {
  const callbackUrl = returnOrigin ? createCheckoutCallbackUrl(returnOrigin) : null;
  return {
    razorpayOrderId: attempt.razorpayOrderId,
    keyId: process.env.RAZORPAY_KEY_ID,
    amount: Math.round(attempt.amount * 100),
    currency: 'INR',
    ...(callbackUrl ? { callbackUrl } : {})
  };
}

function allowedCheckoutReturnOrigin(origin) {
  if (!origin) return null;
  const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map(value => value.trim());
  try {
    const normalizedOrigin = new URL(origin).origin;
    return allowedOrigins.includes(normalizedOrigin) ? normalizedOrigin : null;
  } catch {
    return null;
  }
}

function createCheckoutCallbackUrl(returnOrigin) {
  const publicApiUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_API_URL;
  if (!publicApiUrl) return null;
  const callbackUrl = new URL('/api/payments/razorpay/callback', publicApiUrl);
  callbackUrl.searchParams.set('returnOrigin', returnOrigin);
  return callbackUrl.toString();
}

async function fetchAndCapturePayment(paymentId, razorpayOrderId, amount) {
  const razorpay = getRazorpayClient();
  let payment = await razorpay.payments.fetch(paymentId);
  const expectedAmount = Math.round(amount * 100);
  if (
    payment.order_id !== razorpayOrderId
    || payment.amount !== expectedAmount
    || payment.currency !== 'INR'
  ) {
    throw new AppError(409, 'Payment does not match the expected amount and order');
  }
  if (payment.status === 'authorized') {
    try {
      payment = await razorpay.payments.capture(paymentId, expectedAmount, 'INR');
    } catch {
      throw new AppError(502, 'Payment was authorized but could not be captured. Contact the store before retrying.');
    }
  }
  return payment;
}

export async function createCheckoutPayment(req, res) {
  const {
    addressId,
    storeId: requestedStoreId,
    orderType,
    pickupAt,
    idempotencyKey
  } = req.validated.body;
  const existingAttempt = await CheckoutAttempt.findOne({
    userId: req.auth.id,
    idempotencyKey
  });
  if (existingAttempt) {
    if (existingAttempt.status !== 'pending') {
      throw new AppError(409, 'This checkout attempt is no longer active. Start checkout again to retry payment.');
    }
    const store = await Store.findById(existingAttempt.storeId).select('isOpen openingTime closingTime');
    if (!store || !store.isOpen) {
      throw new AppError(409, 'This store is closed and cannot accept new checkout payments. Choose an open store to continue.');
    }
    if (existingAttempt.orderType === 'pickup' && !isValidPickupTime({
      pickupAt: existingAttempt.pickupAt,
      openingTime: store.openingTime,
      closingTime: store.closingTime
    })) {
      throw new AppError(409, 'The selected pickup slot is no longer available. Choose another slot to continue.');
    }
    return res.status(200).json({
      data: razorpayPaymentData(existingAttempt, allowedCheckoutReturnOrigin(req.get('origin')))
    });
  }

  const [user, cart] = await Promise.all([
    User.findById(req.auth.id),
    Cart.findOne({ userId: req.auth.id })
  ]);
  if (!user) {
    throw new AppError(404, 'User not found');
  }
  if (!cart || cart.items.length === 0) {
    throw new AppError(400, 'Your cart is empty');
  }

  const address = orderType === 'delivery' ? user.addresses.id(addressId) : null;
  if (orderType === 'delivery' && !address) {
    throw new AppError(404, 'Delivery address not found');
  }

  const products = await Product.find({
    _id: { $in: cart.items.map(item => item.productId) }
  });
  const byId = new Map(products.map(product => [String(product._id), product]));
  const missing = cart.items.find(item => !byId.has(String(item.productId)));
  if (missing) {
    throw new AppError(409, 'A cart product is no longer available; update your cart');
  }

  const storeIds = new Set(products.map(product => String(product.storeId)));
  const selectedStoreId = requestedStoreId || [...storeIds][0];
  if (!storeIds.has(selectedStoreId)) {
    throw new AppError(400, 'The selected store has no products in your cart');
  }
  if (!requestedStoreId && storeIds.size > 1) {
    throw new AppError(409, 'Your cart contains products from multiple stores; specify storeId to check out one store at a time');
  }
  const store = await Store.findById(selectedStoreId).select('isOpen openingTime closingTime');
  if (!store || !store.isOpen) {
    throw new AppError(409, 'This store is closed and cannot accept new checkout payments. Choose an open store to continue.');
  }
  if (orderType === 'pickup' && !isValidPickupTime({
    pickupAt,
    openingTime: store.openingTime,
    closingTime: store.closingTime
  })) {
    throw new AppError(409, 'The selected pickup slot is unavailable. Choose a future slot during store hours.');
  }

  const items = cart.items
    .filter(item => String(byId.get(String(item.productId)).storeId) === selectedStoreId)
    .map(item => {
      const product = byId.get(String(item.productId));
      const priced = priceSelection(
        product,
        item.selectionType,
        item.selectedQuantity,
        item.selectedPackLabel
      );
      return {
        productId: product._id,
        productName: product.productName,
        imageUrl: product.imageUrl,
        ...(product.imagePublicId ? { imagePublicId: product.imagePublicId } : {}),
        productType: product.productType,
        selectionType: priced.selectionType,
        quantity: priced.quantity,
        ...(priced.packLabel ? { packLabel: priced.packLabel } : {}),
        price: priced.lineTotal
      };
    });
  const totalCents = items.reduce((sum, item) => sum + Math.round(item.price * 100), 0);
  if (totalCents <= 0) {
    throw new AppError(400, 'Order total must be greater than zero');
  }
  const amount = roundToPaise(totalCents / 100);
  const razorpay = getRazorpayClient();
  const razorpayOrder = await razorpay.orders.create({
    amount: Math.round(amount * 100),
    currency: 'INR',
    receipt: `NB${randomUUID().replaceAll('-', '').slice(0, 18)}`,
    notes: { userId: String(req.auth.id), checkoutKey: idempotencyKey }
  });

  let attempt;
  try {
    attempt = await CheckoutAttempt.create({
      userId: user._id,
      storeId: selectedStoreId,
      ...(address ? { deliveryAddress: {
        label: address.label,
        fullAddress: address.fullAddress,
        landmark: address.landmark,
        pincode: address.pincode
      } } : {}),
      orderType,
      ...(orderType === 'pickup' ? { pickupAt: new Date(pickupAt) } : {}),
      items,
      amount,
      idempotencyKey,
      razorpayOrderId: razorpayOrder.id
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const concurrentAttempt = await CheckoutAttempt.findOne({
      userId: req.auth.id,
      idempotencyKey
    });
    if (!concurrentAttempt || concurrentAttempt.status !== 'pending') throw error;
    attempt = concurrentAttempt;
  }

  const returnOrigin = allowedCheckoutReturnOrigin(req.get('origin'));
  res.status(201).json({ data: razorpayPaymentData(attempt, returnOrigin) });
}

export async function handleRazorpayCheckoutCallback(req, res) {
  const razorpayOrderId = req.body?.razorpay_order_id;
  const paymentId = req.body?.razorpay_payment_id;
  const signature = req.body?.razorpay_signature;
  if (
    typeof razorpayOrderId !== 'string'
    || typeof paymentId !== 'string'
    || typeof signature !== 'string'
    || !/^[a-f\d]{64}$/i.test(signature)
  ) {
    throw new AppError(400, 'Razorpay callback is missing valid payment details');
  }

  const attempt = await CheckoutAttempt.findOne({ razorpayOrderId });
  if (!attempt) {
    throw new AppError(404, 'Checkout payment attempt not found');
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

  const payment = await fetchAndCapturePayment(paymentId, razorpayOrderId, attempt.amount);
  if (
    payment.order_id !== razorpayOrderId
    || payment.amount !== Math.round(attempt.amount * 100)
    || payment.currency !== 'INR'
    || payment.status !== 'captured'
  ) {
    throw new AppError(409, 'Payment is not captured for the expected amount and order');
  }

  const returnOrigin = allowedCheckoutReturnOrigin(req.query.returnOrigin);
  if (!returnOrigin) {
    throw new AppError(400, 'Checkout return address is not allowed');
  }

  const session = await Transaction.db.startSession();
  let orderId;
  try {
    await session.withTransaction(async () => {
      orderId = await completeCheckoutAttempt(attempt._id, paymentId, session);
    });
  } finally {
    await session.endSession();
  }

  const redirectUrl = new URL('/orders', returnOrigin);
  redirectUrl.searchParams.set('order', String(orderId));
  return res.redirect(303, redirectUrl.toString());
}

export async function markCheckoutPaymentFailed(req, res) {
  const attempt = await CheckoutAttempt.findOne({
    razorpayOrderId: req.validated.params.razorpayOrderId,
    userId: req.auth.id
  });
  if (!attempt) {
    throw new AppError(404, 'Checkout payment attempt not found');
  }
  if (attempt.status === 'paid') {
    throw new AppError(409, 'Payment is already confirmed');
  }
  if (attempt.status !== 'failed') {
    attempt.status = 'failed';
    await attempt.save();
  }
  res.json({ data: { status: attempt.status, orderCreated: false } });
}

export async function completeCheckoutAttempt(attemptId, paymentId, session) {
  let attempt = await CheckoutAttempt.findById(attemptId).session(session);
  if (!attempt) {
    throw new AppError(404, 'Checkout payment attempt not found');
  }
  if (attempt.status === 'paid' && attempt.orderId) {
    return attempt.orderId;
  }

  const [order] = await Order.create([{
    userId: attempt.userId,
    storeId: attempt.storeId,
    orderType: attempt.orderType,
    ...(attempt.pickupAt ? { pickupAt: attempt.pickupAt } : {}),
    ...(attempt.deliveryAddress ? { deliveryAddress: attempt.deliveryAddress } : {}),
    items: attempt.items,
    totalAmount: attempt.amount,
    paymentStatus: 'paid'
  }], { session });
  await Transaction.create([{
    orderId: order._id,
    razorpayOrderId: attempt.razorpayOrderId,
    paymentId,
    amount: attempt.amount,
    status: 'paid'
  }], { session });
  await Notification.create([{
    userId: attempt.userId,
    orderId: order._id,
    orderStatus: 'placed',
    title: 'Order placed',
    message: 'Payment was successful and your order is confirmed.'
  }], { session });

  const cart = await Cart.findOne({ userId: attempt.userId }).session(session);
  if (cart) {
    const purchasedItems = new Set(attempt.items.map(item => [
      String(item.productId),
      item.selectionType,
      item.quantity,
      item.packLabel || ''
    ].join('|')));
    cart.items = cart.items.filter(item => !purchasedItems.has([
      String(item.productId),
      item.selectionType,
      item.selectedQuantity,
      item.selectedPackLabel || ''
    ].join('|')));
    await cart.save({ session });
  }

  attempt.status = 'paid';
  attempt.paymentId = paymentId;
  attempt.orderId = order._id;
  await attempt.save({ session });
  return order._id;
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
  const attempt = transaction
    ? null
    : await CheckoutAttempt.findOne({ razorpayOrderId, userId: req.auth.id });
  if (!transaction && !attempt) {
    throw new AppError(404, 'Payment transaction not found');
  }
  if (transaction) {
    const order = await Order.findOne({ _id: transaction.orderId, userId: req.auth.id });
    if (!order) {
      throw new AppError(404, 'Order not found');
    }
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

  const expectedAmount = transaction?.amount ?? attempt.amount;
  const payment = await fetchAndCapturePayment(paymentId, razorpayOrderId, expectedAmount);
  if (
    payment.order_id !== razorpayOrderId
    || payment.amount !== Math.round(expectedAmount * 100)
    || payment.currency !== 'INR'
  ) {
    throw new AppError(409, 'Payment is not captured for the expected amount and order');
  }
  if (payment.status !== 'captured') {
    if (attempt && payment.status === 'failed' && attempt.status !== 'paid') {
      await CheckoutAttempt.updateOne(
        { _id: attempt._id, status: { $ne: 'paid' } },
        { $set: { status: 'failed', paymentId, updatedAt: new Date() } }
      );
    }
    throw new AppError(409, 'Payment was not captured; no order was placed');
  }

  if (attempt) {
    const session = await Transaction.db.startSession();
    let orderId;
    try {
      await session.withTransaction(async () => {
        orderId = await completeCheckoutAttempt(attempt._id, paymentId, session);
      });
    } finally {
      await session.endSession();
    }
    return res.json({ data: { orderId, paymentStatus: 'paid' } });
  }

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
      const status = event.event === 'payment.captured' ? 'paid' : 'failed';
      if (transaction) {
        if (payment.amount !== Math.round(transaction.amount * 100) || payment.currency !== 'INR') {
          throw new AppError(409, 'Webhook payment amount does not match the transaction');
        }
        await settleTransaction(transaction, status, payment.id, session);
      } else {
        const attempt = await CheckoutAttempt.findOne({
          razorpayOrderId: payment.order_id
        }).session(session);
        if (!attempt) {
          throw new AppError(404, 'Payment transaction not found');
        }
        if (payment.amount !== Math.round(attempt.amount * 100) || payment.currency !== 'INR') {
          throw new AppError(409, 'Webhook payment amount does not match the checkout attempt');
        }
        if (status === 'paid') {
          await completeCheckoutAttempt(attempt._id, payment.id, session);
        } else if (attempt.status !== 'paid') {
          attempt.status = 'failed';
          attempt.paymentId = payment.id;
          await attempt.save({ session });
        }
      }
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
