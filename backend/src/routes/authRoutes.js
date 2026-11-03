// import { Router } from 'express';
// import { rateLimit } from 'express-rate-limit';
// import {
//   completeUserRegistration,
//   getCurrentAccount,
//   loginStore,
//   sendUserOtp,
//   verifyUserOtp
// } from '../controllers/authController.js';
// import authenticate from '../middleware/authenticate.js';
// import validate from '../middleware/validate.js';
// import { schemas } from '../validation/schemas.js';

// const router = Router();
// const customerAuthLimiter = rateLimit({
//   windowMs: 10 * 60 * 1000,
//   limit: 5,
//   standardHeaders: 'draft-8',
//   legacyHeaders: false,
//   message: { error: 'Too many verification attempts; try again later' }
// });
// const loginLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   limit: 10,
//   standardHeaders: 'draft-8',
//   legacyHeaders: false,
//   message: { error: 'Too many login attempts; try again later' }
// });

// router.post('/users/otp/send', customerAuthLimiter, validate(schemas.sendOtp), sendUserOtp);
// router.post('/users/verify', customerAuthLimiter, validate(schemas.verifyOtp), verifyUserOtp);
// router.post('/users/register', customerAuthLimiter, validate(schemas.completeUserRegistration), completeUserRegistration);
// router.post('/stores/login', loginLimiter, validate(schemas.storeLogin), loginStore);
// router.get('/me', authenticate(), getCurrentAccount);

// export default router;

import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';

import {
  completeUserRegistration,
  getCurrentAccount,
  loginStore,
  sendUserOtp,
  verifyUserOtp
} from '../controllers/authController.js';

import authenticate from '../middleware/authenticate.js';
import validate from '../middleware/validate.js';
import { schemas } from '../validation/schemas.js';

const router = Router();

// OTP sending: IP-based protection
const sendOtpIpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Too many OTP requests. Try again later.'
  }
});

// OTP sending: Phone-based protection
const sendOtpPhoneLimiter = rateLimit({
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
const sendOtpCooldownLimiter = rateLimit({
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
const verifyOtpIpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Too many verification attempts. Try again later.'
  }
});

// OTP verification: Phone-based protection
const verifyOtpPhoneLimiter = rateLimit({
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
const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Too many registration attempts. Try again later.'
  }
});

// Store login protection
const loginLimiter = rateLimit({
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

export default router;
