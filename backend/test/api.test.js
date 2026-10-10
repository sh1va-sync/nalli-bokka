import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
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
  assert.deepEqual(await response.json(), { status: 'ok' });
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
