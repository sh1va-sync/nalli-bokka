import assert from 'node:assert/strict';
import { test } from 'node:test';
import { uploadCategoryImage } from '../src/services/productImages.js';

test('category image upload identifies missing Cloudinary settings without exposing values', async () => {
  const settingNames = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const previousSettings = Object.fromEntries(settingNames.map(name => [name, process.env[name]]));
  for (const name of settingNames) delete process.env[name];

  try {
    await assert.rejects(
      uploadCategoryImage({ buffer: Buffer.from('image') }, 'store-id'),
      error => {
        assert.equal(error.status, 503);
        assert.match(error.message, /CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET/);
        return true;
      }
    );
  } finally {
    for (const name of settingNames) {
      if (previousSettings[name] === undefined) delete process.env[name];
      else process.env[name] = previousSettings[name];
    }
  }
});
