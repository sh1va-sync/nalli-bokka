import jwt from 'jsonwebtoken';
import RevokedToken from '../models/RevokedToken.js';
import AppError from '../utils/AppError.js';

function authenticate(requiredRole) {
  return async (req, _res, next) => {
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

    let payload;
    try {
      payload = jwt.verify(token, secret, {
        algorithms: ['HS256'],
        issuer: 'nalli-bokka-api',
        maxAge: '1h'
      });
    } catch {
      return next(new AppError(401, 'Invalid or expired authentication token'));
    }
    try {
      if (typeof payload !== 'object' || !payload.sub || !['user', 'store'].includes(payload.role)) {
        return next(new AppError(401, 'Invalid authentication token'));
      }
      if (requiredRole && payload.role !== requiredRole) {
        return next(new AppError(403, 'You are not allowed to access this resource'));
      }

      if (payload.jti && await RevokedToken.exists({ $or: [
        { _id: payload.jti },
        { _id: `account:${payload.role}:${payload.sub}`, revokedBefore: { $gte: new Date(payload.sessionStartedAt || payload.iat * 1000) } }
      ] })) {
        return next(new AppError(401, 'Session has ended; sign in again'));
      }
      req.auth = { id: payload.sub, role: payload.role, jti: payload.jti, exp: payload.exp };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export default authenticate;
