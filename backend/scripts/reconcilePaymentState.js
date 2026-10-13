import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import connectDatabase from '../src/config/database.js';
import CheckoutAttempt from '../src/models/CheckoutAttempt.js';
import Transaction from '../src/models/Transaction.js';
import getRazorpayClient from '../src/services/razorpay.js';
import {
  applyRefundResult,
  completeCheckoutAttempt,
  settleTransaction
} from '../src/controllers/paymentController.js';

const minimumAgeMinutes = Number(process.env.RECONCILE_MIN_AGE_MINUTES || 10);
const batchSize = 100;

if (!Number.isInteger(minimumAgeMinutes) || minimumAgeMinutes < 1 || minimumAgeMinutes > 1440) {
  throw new Error('RECONCILE_MIN_AGE_MINUTES must be an integer between 1 and 1440');
}

function isExpectedPayment(payment, expectedAmount, razorpayOrderId) {
  return payment.order_id === razorpayOrderId
    && payment.amount === Math.round(expectedAmount * 100)
    && payment.currency === 'INR';
}

async function withTransaction(callback) {
  const session = await Transaction.db.startSession();
  try {
    await session.withTransaction(() => callback(session));
  } finally {
    await session.endSession();
  }
}

export async function reconcilePayment(resource, type, razorpay) {
  const providerOrder = await razorpay.orders.fetch(resource.razorpayOrderId);
  if (
    providerOrder.amount !== Math.round(resource.amount * 100)
    || providerOrder.currency !== 'INR'
  ) {
    throw new Error('Provider order does not match the recorded amount and currency');
  }
  const paymentsResponse = await razorpay.orders.fetchPayments(resource.razorpayOrderId);
  const payments = paymentsResponse.items || [];
  const captured = payments.find(payment => payment.status === 'captured');
  if (captured) {
    if (!isExpectedPayment(captured, resource.amount, resource.razorpayOrderId)) {
      throw new Error('Provider payment does not match the recorded order and amount');
    }
    if (type === 'checkoutAttempt') {
      await withTransaction(session => completeCheckoutAttempt(resource._id, captured.id, session));
    } else {
      await withTransaction(session => settleTransaction(resource, 'paid', captured.id, session));
    }
    return 'paid';
  }

  if (
    payments.length > 0
    && Number.isInteger(providerOrder.attempts)
    && providerOrder.attempts === payments.length
    && payments.every(payment => payment.status === 'failed')
    && payments.every(payment => isExpectedPayment(payment, resource.amount, resource.razorpayOrderId))
  ) {
    if (type === 'checkoutAttempt') {
      await CheckoutAttempt.updateOne(
        { _id: resource._id, status: 'pending' },
        { $set: { status: 'failed', paymentId: payments[payments.length - 1].id } }
      );
    } else {
      await withTransaction(session => settleTransaction(resource, 'failed', payments[payments.length - 1].id, session));
    }
    return 'failed';
  }

  return 'pending';
}

async function findPendingRefund(transaction, razorpay) {
  if (transaction.refundId) {
    return razorpay.refunds.fetch(transaction.refundId);
  }
  if (!transaction.paymentId) return null;
  const refundsResponse = await razorpay.payments.fetchMultipleRefund(transaction.paymentId, { count: 100 });
  return (refundsResponse.items || []).find(refund => (
    refund.notes?.refundRequestId === transaction.refundRequestId
  )) || null;
}

export async function reconcileRefund(transaction, razorpay) {
  const refund = await findPendingRefund(transaction, razorpay);
  if (!refund) return 'pending';
  if (
    refund.payment_id !== transaction.paymentId
    || refund.amount !== Math.round(transaction.amount * 100)
    || (refund.currency && refund.currency !== 'INR')
    || (refund.notes?.refundRequestId && refund.notes.refundRequestId !== transaction.refundRequestId)
  ) {
    throw new Error('Provider refund does not match the recorded payment and amount');
  }

  const status = ['created', 'pending'].includes(refund.status)
    ? 'pending'
    : refund.status === 'processed'
      ? 'processed'
      : refund.status === 'failed'
        ? 'failed'
        : null;
  if (!status) throw new Error('Provider returned an unsupported refund status');
  await applyRefundResult(transaction._id, transaction.refundRequestId, refund, status);
  return status;
}

async function run() {
  await connectDatabase();
  const razorpay = getRazorpayClient();
  const before = new Date(Date.now() - minimumAgeMinutes * 60 * 1000);
  const counters = { paymentPaid: 0, paymentFailed: 0, refundProcessed: 0, refundFailed: 0, stillPending: 0, errors: 0 };

  const pendingAttempts = await CheckoutAttempt.find({ status: 'pending', createdAt: { $lte: before } })
    .sort({ createdAt: 1 })
    .limit(batchSize);
  const createdTransactions = await Transaction.find({ status: 'created', timestamp: { $lte: before } })
    .sort({ timestamp: 1 })
    .limit(batchSize);
  const pendingRefunds = await Transaction.find({
    refundStatus: 'pending',
    $or: [
      { refundRequestedAt: { $lte: before } },
      { refundRequestedAt: { $exists: false }, timestamp: { $lte: before } }
    ]
  })
    .sort({ refundRequestedAt: 1 })
    .limit(batchSize);

  for (const [type, records] of [['checkoutAttempt', pendingAttempts], ['transaction', createdTransactions]]) {
    for (const record of records) {
      try {
        const result = await reconcilePayment(record, type, razorpay);
        if (result === 'paid') counters.paymentPaid += 1;
        else if (result === 'failed') counters.paymentFailed += 1;
        else counters.stillPending += 1;
      } catch (error) {
        counters.errors += 1;
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          event: 'payment.reconciliation.failed',
          recordType: type,
          recordId: String(record._id),
          message: error.message
        }));
      }
    }
  }

  for (const transaction of pendingRefunds) {
    try {
      const result = await reconcileRefund(transaction, razorpay);
      if (result === 'processed') counters.refundProcessed += 1;
      else if (result === 'failed') counters.refundFailed += 1;
      else counters.stillPending += 1;
    } catch (error) {
      counters.errors += 1;
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        event: 'refund.reconciliation.failed',
        transactionId: String(transaction._id),
        message: error.message
      }));
    }
  }

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: counters.errors ? 'error' : 'info',
    event: 'payment.reconciliation.completed',
    scanned: pendingAttempts.length + createdTransactions.length + pendingRefunds.length,
    minimumAgeMinutes,
    ...counters
  }));

  await Transaction.db.close();
  if (counters.errors) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(async error => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      event: 'payment.reconciliation.failed',
      message: error.message
    }));
    await Transaction.db.close();
    process.exitCode = 1;
  });
}
