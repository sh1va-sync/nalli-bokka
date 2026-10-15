import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { verifyUserOtp } from '../src/controllers/authController.js';
import firebaseAuth from '../src/services/firebaseAuth.js';
import User from '../src/models/User.js';
import Order from '../src/models/Order.js';
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

test('invoice downloads require an authenticated customer or store', async () => {
  const customerResponse = await fetch(`${baseUrl}/orders/507f1f77bcf86cd799439011/invoice`);
  const storeResponse = await fetch(`${baseUrl}/store/orders/507f1f77bcf86cd799439011/invoice`);
  assert.equal(customerResponse.status, 401);
  assert.equal(storeResponse.status, 401);
});

test('product category management endpoints require a store token', async () => {
  const listResponse = await fetch(`${baseUrl}/store/product-categories`);
  const createResponse = await fetch(`${baseUrl}/store/product-categories`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'dry fruits' })
  });
  assert.equal(listResponse.status, 401);
  assert.equal(createResponse.status, 401);
});

test('customer invoice download is scoped to the authenticated user', async () => {
  const originalFindOne = Order.findOne;
  const userId = '507f1f77bcf86cd799439012';
  const orderId = '507f1f77bcf86cd799439011';
  const order = {
    _id: orderId,
    createdAt: new Date('2026-10-15T10:00:00.000Z'),
    paymentStatus: 'paid',
    totalAmount: 180,
    storeId: { storeName: 'Gajwel Store', location: 'Gajwel' },
    userId: { name: 'Shiva', phone: '+919999999999' },
    deliveryAddress: { label: 'Home', fullAddress: '12 Market Road', pincode: '500001' },
    items: [{ productName: 'Sunflower Oil', selectionType: 'pack', quantity: 1, packLabel: '1 L', price: 180 }],
    toObject() { return this; }
  };
  let queryFilter;
  let updateFilter;
  let updateDocument;
  Order.findOne = filter => {
    queryFilter = filter;
    return {
      populate() { return this; },
      select() { return this; },
      then(resolve, reject) { return Promise.resolve(order).then(resolve, reject); }
    };
  };
  const originalUpdateOne = Order.updateOne;
  Order.updateOne = async (filter, update, options) => {
    updateFilter = filter;
    updateDocument = { update, options };
    return { modifiedCount: 1 };
  };

  try {
    const token = jwt.sign({ role: 'user' }, process.env.JWT_SECRET, {
      subject: userId,
      expiresIn: '5m',
      issuer: 'nalli-bokka-api'
    });
    const response = await fetch(`${baseUrl}/orders/${orderId}/invoice`, {
      headers: { authorization: `Bearer ${token}` }
    });
    const pdf = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.match(response.headers.get('content-disposition'), /invoice-NB-507F1F77BCF86CD799439011\.pdf/);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.deepEqual(queryFilter, { _id: orderId, userId });
    assert.deepEqual(updateFilter, { _id: orderId, invoicePdf: { $exists: false } });
    assert.equal(updateDocument.update.$set.invoicePdf.subarray(0, 5).toString(), '%PDF-');
    assert.equal(updateDocument.options.timestamps, false);
  } finally {
    Order.findOne = originalFindOne;
    Order.updateOne = originalUpdateOne;
  }
});

test('store invoice download is scoped to the authenticated store', async () => {
  const originalFindOne = Order.findOne;
  const storeId = '507f1f77bcf86cd799439013';
  const orderId = '507f1f77bcf86cd799439011';
  let queryFilter;
  const storedPdf = Buffer.from('%PDF-stored-invoice');
  Order.findOne = filter => {
    queryFilter = filter;
    return {
      populate() { return this; },
      select() { return this; },
      then(resolve, reject) {
        return Promise.resolve({
          _id: orderId,
          createdAt: new Date('2026-10-15T10:00:00.000Z'),
          paymentStatus: 'paid',
          totalAmount: 180,
          storeId: { storeName: 'Gajwel Store', location: 'Gajwel' },
          userId: { name: 'Shiva', phone: '+919999999999' },
          deliveryAddress: { label: 'Home', fullAddress: '12 Market Road', pincode: '500001' },
          items: [{ productName: 'Sunflower Oil', selectionType: 'pack', quantity: 1, packLabel: '1 L', price: 180 }],
          invoicePdf: storedPdf
        }).then(resolve, reject);
      }
    };
  };

  try {
    const token = jwt.sign({ role: 'store' }, process.env.JWT_SECRET, {
      subject: storeId,
      expiresIn: '5m',
      issuer: 'nalli-bokka-api'
    });
    const response = await fetch(`${baseUrl}/store/orders/${orderId}/invoice`, {
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), storedPdf);
    assert.deepEqual(queryFilter, { _id: orderId, storeId });
  } finally {
    Order.findOne = originalFindOne;
  }
});

test('Firebase phone sign-in token is required before auth verification', async () => {
  const missingToken = await fetch(`${baseUrl}/auth/users/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(missingToken.status, 400);

  const legacyOtpBody = await fetch(`${baseUrl}/auth/users/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '+15551234567', code: '123456' })
  });
  assert.equal(legacyOtpBody.status, 400);

  const malformedToken = await fetch(`${baseUrl}/auth/users/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ firebaseIdToken: '' })
  });
  assert.equal(malformedToken.status, 400);

  const retiredOtpEndpoint = await fetch(`${baseUrl}/auth/users/otp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '+15551234567' })
  });
  assert.equal(retiredOtpEndpoint.status, 404);

  const login = await fetch(`${baseUrl}/auth/stores/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: '', password: '' })
  });
  assert.equal(login.status, 400);
});

test('Firebase phone token claims determine the customer login identity', async () => {
  const originalVerifyIdToken = firebaseAuth.verifyIdToken;
  const originalFindOne = User.findOne;
  firebaseAuth.verifyIdToken = async token => {
    assert.equal(token, 'valid-firebase-id-token');
    return {
      phone_number: '+15551234567',
      firebase: { sign_in_provider: 'phone' }
    };
  };
  User.findOne = async filter => {
    assert.deepEqual(filter, { phone: '+15551234567' });
    return { _id: '507f1f77bcf86cd799439011', phone: '+15551234567' };
  };

  try {
    const response = await fetch(`${baseUrl}/auth/users/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firebaseIdToken: 'valid-firebase-id-token' })
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.user.phone, '+15551234567');
    assert.equal(jwt.verify(result.token, process.env.JWT_SECRET).role, 'user');
  } finally {
    firebaseAuth.verifyIdToken = originalVerifyIdToken;
    User.findOne = originalFindOne;
  }
});

test('invalid Firebase ID tokens return unauthorized', async () => {
  const originalVerifyIdToken = firebaseAuth.verifyIdToken;
  firebaseAuth.verifyIdToken = async () => {
    throw Object.assign(new Error('Invalid Firebase token'), { code: 'auth/invalid-id-token' });
  };

  try {
    const response = await fetch(`${baseUrl}/auth/users/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firebaseIdToken: 'invalid-firebase-id-token' })
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, 'Firebase phone verification is invalid or expired');
  } finally {
    firebaseAuth.verifyIdToken = originalVerifyIdToken;
  }
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
    pricingMode: 'weight',
    productName: 'Mutton',
    imageUrl: 'https://example.test/mutton.jpg',
    pricePerKg: 800
  });
  const invalid = schemas.productCreate.body.safeParse({
    productType: 'meat',
    pricingMode: 'weight',
    productName: 'Mutton',
    imageUrl: 'javascript:alert(1)',
    pricePerKg: 800
  });
  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
  assert.equal(schemas.productCreate.body.safeParse({
    productType: 'meat',
    productName: 'Mutton',
    imageUrl: 'https://example.test/mutton.jpg',
    pricePerKg: 800
  }).success, false);
  assert.equal(schemas.productCreate.body.safeParse({
    productType: 'meat',
    pricingMode: 'pack',
    productName: 'Mutton pack',
    imageUrl: 'https://example.test/mutton.jpg',
    packs: [{ label: '500 g', price: 450 }]
  }).success, true);
  assert.equal(schemas.productCreate.body.safeParse({
    productType: 'dry fruits',
    pricingMode: 'weight',
    productName: 'Almonds',
    imageUrl: 'https://example.test/almonds.jpg',
    pricePerKg: 900
  }).success, true);
  assert.equal(schemas.productCreate.body.safeParse({
    productType: 'dry fruits',
    productName: 'Almonds',
    imageUrl: 'https://example.test/almonds.jpg',
    pricePerKg: 900
  }).success, false);
  assert.equal(schemas.storeProductList.query.parse({
    productType: 'dry fruits',
    inStock: 'false',
    pricingMode: 'pack'
  }).inStock, false);
});

test('unknown API paths return 404', async () => {
  const response = await fetch(`${baseUrl}/not-a-route`);
  assert.equal(response.status, 404);
});
