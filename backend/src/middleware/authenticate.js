import jwt from 'jsonwebtoken';
import AppError from '../utils/AppError.js';

function authenticate(requiredRole) {
  return (req, _res, next) => {
    const authorization = req.get('authorization');
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : null;

    if (!token) {
      return next(new AppError(401, 'Authentication required'));
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return next(new AppError(500, 'Authentication is not configured'));
    }

    try {
      const payload = jwt.verify(token, secret, {
        algorithms: ['HS256'],
        issuer: 'nalli-bokka-api'
      });
      if (typeof payload !== 'object' || !payload.sub || !payload.role) {
        return next(new AppError(401, 'Invalid authentication token'));
      }
      if (requiredRole && payload.role !== requiredRole) {
        return next(new AppError(403, 'You are not allowed to access this resource'));
      }

      req.auth = { id: payload.sub, role: payload.role };
      return next();
    } catch {
      return next(new AppError(401, 'Invalid or expired authentication token'));
    }
  };
}

export default authenticate;
