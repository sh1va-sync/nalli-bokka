import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseProductMultipartData, requireProductImage } from '../src/middleware/productImageUpload.js';

function runMiddleware(middleware, req) {
  return new Promise(resolve => middleware(req, {}, error => resolve(error)));
}

test('product multipart data parses JSON and validates uploaded image signatures', async () => {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const req = {
    body: { productData: JSON.stringify({ productName: 'Mutton' }) },
    file: { mimetype: 'image/png', buffer: pngSignature }
  };

  assert.equal(await runMiddleware(parseProductMultipartData, req), undefined);
  assert.deepEqual(req.body, { productName: 'Mutton' });
});

test('product multipart data rejects invalid JSON and spoofed image types', async () => {
  const invalidJson = await runMiddleware(parseProductMultipartData, {
    body: { productData: '{invalid' }
  });
  assert.equal(invalidJson.status, 400);

  const spoofedImage = await runMiddleware(parseProductMultipartData, {
    body: { productData: '{}' },
    file: { mimetype: 'image/png', buffer: Buffer.from('not a png') }
  });
  assert.equal(spoofedImage.status, 400);
});

test('product creation requires an uploaded image file', async () => {
  const error = await runMiddleware(requireProductImage, {});
  assert.equal(error.status, 400);
});
