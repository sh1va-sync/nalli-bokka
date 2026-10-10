import mongoose from 'mongoose';
import AppError from '../utils/AppError.js';

function errorHandler(err, _req, res, _next) {
  let status = err instanceof AppError ? err.status : 500;
  let message = err instanceof AppError ? err.message : 'Internal server error';

  if (err.code === 11000) {
    status = 409;
    message = 'A record with this value already exists';
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = Object.values(err.errors).map(error => error.message).join('; ');
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid ${err.path}`;
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Request body contains invalid JSON';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body is too large';
  }

  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({ error: message });
}

export default errorHandler;
