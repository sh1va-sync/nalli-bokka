import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconcilePayment, reconcileRefund } from '../scripts/reconcilePaymentState.js';

test('payment reconciliation leaves an open payment attempt pending', async () => {
  const razorpay = {
    orders: {
      fetch: async () => ({ amount: 40000, currency: 'INR', attempts: 0 }),
      fetchPayments: async () => ({ items: [] })
    }
  };
  const result = await reconcilePayment({
    _id: 'attempt-id',
    amount: 400,
    razorpayOrderId: 'order-id'
  }, 'checkoutAttempt', razorpay);
  assert.equal(result, 'pending');
});

test('payment reconciliation rejects provider orders with a mismatched amount', async () => {
  const razorpay = {
    orders: {
      fetch: async () => ({ amount: 39900, currency: 'INR' }),
      fetchPayments: async () => {
        throw new Error('Must not inspect payments for a mismatched order');
      }
    }
  };
  await assert.rejects(
    reconcilePayment({
      _id: 'attempt-id',
      amount: 400,
      razorpayOrderId: 'order-id'
    }, 'checkoutAttempt', razorpay),
    /does not match the recorded amount and currency/
  );
});

test('refund reconciliation leaves a provider refund not yet created as pending', async () => {
  const result = await reconcileRefund({
    paymentId: null,
    refundRequestId: 'request-id'
  }, {});
  assert.equal(result, 'pending');
});

test('refund reconciliation rejects a refund for another payment', async () => {
  const razorpay = {
    refunds: {
      fetch: async () => ({
        id: 'refund-id',
        payment_id: 'another-payment',
        amount: 40000,
        status: 'processed'
      })
    }
  };
  await assert.rejects(
    reconcileRefund({
      paymentId: 'payment-id',
      refundId: 'refund-id',
      refundRequestId: 'request-id',
      amount: 400
    }, razorpay),
    /does not match the recorded payment and amount/
  );
});
