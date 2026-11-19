import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';

import {
  completeUserRegistration,
  getCurrentAccount,
  loginStore,
  sendUserOtp,
  verifyUserOtp
} from '../controllers/authController.js';

import MongoRateLimitStore from '../services/mongoRateLimitStore.js';
import RevokedToken from '../models/RevokedToken.js';
import authenticate from '../middleware/authenticate.js';
import validate from '../middleware/validate.js';
import { schemas } from '../validation/schemas.js';

const router = Router();
function limiter(name, options) {
  const useMongo = process.env.RATE_LIMIT_STORE === 'mongo' || process.env.NODE_ENV === 'production';
  return rateLimit({ ...options, ...(useMongo ? { store: new MongoRateLimitStore(name) } : {}) });
}


// OTP sending: IP-based protection
const sendOtpIpLimiter = limiter('sendOtpIpLimiter', {
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Too many OTP requests. Try again later.'
  }
});

// OTP sending: Phone-based protection
const sendOtpPhoneLimiter = limiter('sendOtpPhoneLimiter', {
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => `phone:${req.body.phone}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'OTP request limit reached for this phone number.'
  }
});

// Prevent repeated OTP requests within a short interval
const sendOtpCooldownLimiter = limiter('sendOtpCooldownLimiter', {
  windowMs: 60 * 1000,
  limit: 1,
  keyGenerator: (req) => `phone:${req.body.phone}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Please wait before requesting another OTP.'
  }
});

// OTP verification: IP-based protection
const verifyOtpIpLimiter = limiter('verifyOtpIpLimiter', {
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Too many verification attempts. Try again later.'
  }
});

// OTP verification: Phone-based protection
const verifyOtpPhoneLimiter = limiter('verifyOtpPhoneLimiter', {
  windowMs: 10 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => `phone:${req.body.phone}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Too many verification attempts for this phone number.'
  }
});

// Registration protection
const registrationLimiter = limiter('registrationLimiter', {
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Too many registration attempts. Try again later.'
  }
});

// Store login protection
const loginLimiter = limiter('loginLimiter', {
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Too many login attempts. Try again later.'
  }
});

// Customer authentication
router.post(
  '/users/otp/send',
  validate(schemas.sendOtp),
  sendOtpIpLimiter,
  sendOtpPhoneLimiter,
  sendOtpCooldownLimiter,
  sendUserOtp
);

router.post(
  '/users/verify',
  validate(schemas.verifyOtp),
  verifyOtpIpLimiter,
  verifyOtpPhoneLimiter,
  verifyUserOtp
);

router.post(
  '/users/register',
  validate(schemas.completeUserRegistration),
  registrationLimiter,
  completeUserRegistration
);

// Store authentication
router.post(
  '/stores/login',
  validate(schemas.storeLogin),
  loginLimiter,
  loginStore
);

// Current authenticated account
router.get(
  '/me',
  authenticate(),
  getCurrentAccount
);

router.post('/logout', authenticate(), async (req, res) => {
  if (req.auth.jti) {
    await RevokedToken.updateOne({ _id: req.auth.jti },
      { $set: { expiresAt: new Date(req.auth.exp * 1000) } }, { upsert: true });
  }
  res.status(204).end();
});
export default router;
