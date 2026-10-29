import { randomUUID } from 'node:crypto';
import { v2 as cloudinaryApi } from 'cloudinary';
import AppError from '../utils/AppError.js';

function configureCloudinary() {
  const settings = {
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY?.trim(),
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET?.trim()
  };
  const missingSettings = Object.entries(settings)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missingSettings.length) {
    throw new AppError(503, `Image storage is not configured. Missing backend setting(s): ${missingSettings.join(', ')}.`);
  }
  cloudinaryApi.config({
    cloud_name: settings.CLOUDINARY_CLOUD_NAME,
    api_key: settings.CLOUDINARY_API_KEY,
    api_secret: settings.CLOUDINARY_API_SECRET,
    secure: true
  });
}

function logCloudinaryFailure(action, error, imageType = 'product') {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    event: `cloudinary.${imageType}_image.${action}.failed`,
    errorType: error?.name || 'Error'
  }));
}

async function uploadImage(file, storeId, imageType) {
  configureCloudinary();
  try {
    const result = await new Promise((resolve, reject) => {
      cloudinaryApi.uploader.upload_stream({
        folder: `nalli-bokka/${imageType === 'category' ? 'categories' : 'products'}`,
        public_id: `${storeId}/${randomUUID()}`,
        resource_type: 'image',
        allowed_formats: ['jpg', 'png', 'webp'],
        overwrite: false
      }, (error, uploaded) => error ? reject(error) : resolve(uploaded)).end(file.buffer);
    });
    if (!result?.secure_url || !result?.public_id) {
      throw new Error('Cloudinary returned incomplete image metadata');
    }
    return { imageUrl: result.secure_url, imagePublicId: result.public_id };
  } catch (error) {
    logCloudinaryFailure('upload', error, imageType);
    throw new AppError(502, `Could not store the ${imageType} image. Please try again.`);
  }
}

async function deleteImage(imagePublicId, imageType) {
  if (!imagePublicId) return;
  configureCloudinary();
  try {
    const result = await cloudinaryApi.uploader.destroy(imagePublicId, {
      resource_type: 'image',
      invalidate: true
    });
    if (!['ok', 'not found'].includes(result?.result)) {
      throw new Error(`Unexpected Cloudinary deletion result: ${result?.result || 'empty response'}`);
    }
  } catch (error) {
    logCloudinaryFailure('delete', error, imageType);
    throw new AppError(502, `Could not remove the ${imageType} image from Cloudinary.`);
  }
}

export const uploadProductImage = (file, storeId) => uploadImage(file, storeId, 'product');
export const uploadCategoryImage = (file, storeId) => uploadImage(file, storeId, 'category');
export const deleteProductImage = imagePublicId => deleteImage(imagePublicId, 'product');
export const deleteCategoryImage = imagePublicId => deleteImage(imagePublicId, 'category');
