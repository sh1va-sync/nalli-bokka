import assert from 'node:assert/strict';
import { test } from 'node:test';
import getRazorpayClient from '../src/services/razorpay.js';

test('refund transport sends a request-scoped provider idempotency header', async () => {
  const originalFetch = globalThis.fetch;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_transport';
  process.env.RAZORPAY_KEY_SECRET = 'test-only';
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ key: options.headers['X-Refund-Idempotency'], url, data: JSON.parse(options.body) });
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, `Basic ${Buffer.from('rzp_test_transport:test-only').toString('base64')}`);
    assert.ok(options.signal);
    return Response.json({ id: 'rfnd_test' });
  };
  try {
    const provider = getRazorpayClient();
    const body = { amount: 2500, notes: { refundRequestId: 'request-first-1234' } };
    await Promise.all([
      provider.payments.refundIdempotent('pay_first', body, 'request-first-1234'),
      provider.payments.refundIdempotent('pay_second', { amount: 100 }, 'request-second-1234')
    ]);
    assert.deepEqual(requests.map(request => request.key).sort(), ['request-first-1234', 'request-second-1234']);
    assert.deepEqual(requests.find(request => request.key === 'request-first-1234').data, body);
    assert.ok(requests.every(request => request.url.startsWith('https://api.razorpay.com/v1/payments/') && request.url.endsWith('/refund')));
    await provider.payments.refundIdempotent('pay_first', body, 'request-first-1234');
    assert.deepEqual(requests[2], requests[0]);
    assert.equal(provider.api.rq.defaults.headers['X-Refund-Idempotency'], undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
