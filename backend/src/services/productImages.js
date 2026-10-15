import { randomUUID } from 'node:crypto';
import { v2 as cloudinaryApi } from 'cloudinary';
import AppError from '../utils/AppError.js';

function configureCloudinary() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new AppError(503, 'Product image storage is not configured. Set the Cloudinary environment variables.');
  }
  cloudinaryApi.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true
  });
}

function logCloudinaryFailure(action, error) {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    event: `cloudinary.product_image.${action}.failed`,
    errorType: error?.name || 'Error'
  }));
}

export async function uploadProductImage(file, storeId) {
  configureCloudinary();
  try {
    const result = await new Promise((resolve, reject) => {
      cloudinaryApi.uploader.upload_stream({
        folder: 'nalli-bokka/products',
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
    logCloudinaryFailure('upload', error);
    throw new AppError(502, 'Could not store the product image. Please try again.');
  }
}

export async function deleteProductImage(imagePublicId) {
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
    logCloudinaryFailure('delete', error);
    throw new AppError(502, 'Could not remove the previous product image from Cloudinary.');
  }
}
