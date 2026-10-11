import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { schemas } from '../src/validation/schemas.js';

process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-api-tests';

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

test('health endpoint responds without MongoDB', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('x-request-id'), /^[\da-f-]{36}$/i);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('readiness endpoint reports unavailable when MongoDB is disconnected', async () => {
  const response = await fetch(`${baseUrl}/health/ready`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: 'not_ready' });
});

test('HTTP requests emit structured console logs without query strings', async () => {
  const logs = [];
  const originalLog = console.log;
  console.log = message => logs.push(message);
  try {
    const response = await fetch(`${baseUrl}/health?access_token=must-not-be-logged`);
    assert.equal(response.status, 200);
  } finally {
    console.log = originalLog;
  }

  const requestLog = logs
    .map(message => JSON.parse(message))
    .find(entry => entry.event === 'http.request.completed');
  assert.ok(requestLog);
  assert.equal(requestLog.method, 'GET');
  assert.equal(requestLog.path, '/api/health');
  assert.equal(requestLog.statusCode, 200);
  assert.match(requestLog.requestId, /^[\da-f-]{36}$/i);
  assert.equal(JSON.stringify(requestLog).includes('must-not-be-logged'), false);
});

test('invalid query and route parameters return structured validation errors', async () => {
  const queryResponse = await fetch(`${baseUrl}/products?page=0`);
  assert.equal(queryResponse.status, 400);
  assert.equal(typeof (await queryResponse.json()).error, 'string');

  const idResponse = await fetch(`${baseUrl}/stores/not-an-object-id`);
  assert.equal(idResponse.status, 400);
});

test('authentication is required and roles are enforced', async () => {
  const unauthenticated = await fetch(`${baseUrl}/cart`);
  assert.equal(unauthenticated.status, 401);

  const storeToken = jwt.sign({ role: 'store' }, process.env.JWT_SECRET, {
    subject: '507f1f77bcf86cd799439011',
    expiresIn: '5m',
    issuer: 'nalli-bokka-api'
  });
  const wrongRole = await fetch(`${baseUrl}/cart`, {
    headers: { authorization: `Bearer ${storeToken}` }
  });
  assert.equal(wrongRole.status, 403);
});

test('customer notification endpoints require a customer token', async () => {
  const response = await fetch(`${baseUrl}/users/me/notifications`);
  assert.equal(response.status, 401);
});

test('malformed auth input is rejected before provider or database calls', async () => {
  const otp = await fetch(`${baseUrl}/auth/users/otp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: 'not-a-phone' })
  });
  assert.equal(otp.status, 400);

  const login = await fetch(`${baseUrl}/auth/stores/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: '', password: '' })
  });
  assert.equal(login.status, 400);
});

test('dashboard period boundaries must be supplied together in chronological order', () => {
  const validRange = schemas.dashboard.query.safeParse({
    days: '1',
    from: '2026-10-10T00:00:00.000+05:30',
    to: '2026-10-11T00:00:00.000+05:30'
  });
  const missingEnd = schemas.dashboard.query.safeParse({
    from: '2026-10-10T00:00:00.000Z'
  });
  const reversed = schemas.dashboard.query.safeParse({
    from: '2026-10-11T00:00:00.000Z',
    to: '2026-10-10T00:00:00.000Z'
  });
  assert.equal(validRange.success, true);
  assert.equal(missingEnd.success, false);
  assert.equal(reversed.success, false);
});

test('store report exports require a type and paired date boundaries', () => {
  const valid = schemas.storeReportExport.query.safeParse({
    type: 'orders',
    from: '2026-10-10T00:00:00.000+05:30',
    to: '2026-10-11T00:00:00.000+05:30'
  });
  const missingRange = schemas.storeReportExport.query.safeParse({ type: 'orders' });
  const invalidType = schemas.storeReportExport.query.safeParse({
    type: 'customers',
    from: '2026-10-10T00:00:00.000Z',
    to: '2026-10-11T00:00:00.000Z'
  });
  assert.equal(valid.success, true);
  assert.equal(missingRange.success, false);
  assert.equal(invalidType.success, false);
});

test('new customer registration requires the verification token and name', () => {
  const valid = schemas.completeUserRegistration.body.safeParse({
    verificationToken: 'verified-phone-token',
    name: 'Asha Rao',
    email: 'asha@example.com'
  });
  const missingName = schemas.completeUserRegistration.body.safeParse({
    verificationToken: 'verified-phone-token'
  });
  assert.equal(valid.success, true);
  assert.equal(missingName.success, false);
});

test('Razorpay webhook requires its event ID after signature verification', async () => {
  const secret = 'test-webhook-secret';
  process.env.RAZORPAY_WEBHOOK_SECRET = secret;
  const body = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_test', order_id: 'order_test' } } }
  });
  const signature = createHmac('sha256', secret).update(body).digest('hex');
  try {
    const response = await fetch(`${baseUrl.replace('/api', '')}/api/payments/razorpay/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': signature
      },
      body
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'Webhook event ID is missing');
  } finally {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  }
});

test('product image URLs must use a browser-safe HTTP scheme', () => {
  const valid = schemas.productCreate.body.safeParse({
    productType: 'meat',
    productName: 'Mutton',
    imageUrl: 'https://example.test/mutton.jpg',
    pricePerKg: 800
  });
  const invalid = schemas.productCreate.body.safeParse({
    productType: 'meat',
    productName: 'Mutton',
    imageUrl: 'javascript:alert(1)',
    pricePerKg: 800
  });
  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});

test('unknown API paths return 404', async () => {
  const response = await fetch(`${baseUrl}/not-a-route`);
  assert.equal(response.status, 404);
});
