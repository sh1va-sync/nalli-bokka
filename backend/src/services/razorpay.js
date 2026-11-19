import Razorpay from 'razorpay';
import AppError from '../utils/AppError.js';

let client;

function getRazorpayClient() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new AppError(503, 'Online payments are not configured');
  }

  if (!client) {
    client = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
    // This SDK version drops X-Refund-Idempotency. Keep it request-scoped.
    client.payments.refundIdempotent = async (paymentId, params, requestId) => {
      if (!/^[\w-]{10,}$/.test(requestId || '') || !/^\w+$/.test(paymentId || '')) {
        throw new AppError(400, 'Invalid refund request identifiers');
      }
      const credentials = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
      const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/json',
          'X-Refund-Idempotency': requestId
        },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new AppError(502, 'Refund provider did not confirm the request');
      return response.json();
    };
  }

  return client;
}

export default getRazorpayClient;
