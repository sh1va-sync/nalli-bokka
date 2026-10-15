import multer from 'multer';
import AppError from '../utils/AppError.js';

const imageSignatures = {
  'image/jpeg': buffer => buffer.length >= 3
    && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  'image/png': buffer => buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': buffer => buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
};

export const receiveProductImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 1,
    fieldSize: 64 * 1024
  },
  fileFilter(_req, file, callback) {
    if (!Object.hasOwn(imageSignatures, file.mimetype)) {
      callback(new AppError(400, 'Product image must be a JPEG, PNG, or WebP file'));
      return;
    }
    callback(null, true);
  }
}).single('image');

export function parseProductMultipartData(req, _res, next) {
  try {
    if (typeof req.body?.productData !== 'string') {
      throw new AppError(400, 'Product details are missing');
    }
    req.body = JSON.parse(req.body.productData);
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new AppError(400, 'Product details must be an object');
    }
    if (req.file) {
      const isValidImage = imageSignatures[req.file.mimetype]?.(req.file.buffer);
      if (!isValidImage) {
        throw new AppError(400, 'Product image contents do not match the selected image type');
      }
    }
    next();
  } catch (error) {
    next(error instanceof SyntaxError ? new AppError(400, 'Product details contain invalid JSON') : error);
  }
}

export function requireProductImage(req, _res, next) {
  if (!req.file) {
    next(new AppError(400, 'Choose a product image file'));
    return;
  }
  next();
}
