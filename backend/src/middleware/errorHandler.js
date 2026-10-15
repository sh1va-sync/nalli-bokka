import mongoose from 'mongoose';
import AppError from '../utils/AppError.js';

function errorHandler(err, req, res, _next) {
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
  } else if (err instanceof Error && err.name === 'MulterError') {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Product image must be 5 MB or smaller'
      : 'Product image upload is invalid';
  }

  if (status >= 500) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      event: 'http.request.failed',
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      statusCode: status,
      ...(process.env.NODE_ENV === 'production'
        ? { errorType: err.name }
        : { message: err.message, stack: err.stack })
    }));
  }
  res.status(status).json({ error: message });
}

export default errorHandler;
