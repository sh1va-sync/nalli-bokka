import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  completeUserRegistration,
  getCurrentAccount,
  loginStore,
  requestUserOtp,
  verifyUserOtp
} from '../controllers/authController.js';
import authenticate from '../middleware/authenticate.js';
import validate from '../middleware/validate.js';
import { schemas } from '../validation/schemas.js';

const router = Router();
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many verification attempts; try again later' }
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many login attempts; try again later' }
});

router.post('/users/otp', otpLimiter, validate(schemas.requestOtp), requestUserOtp);
router.post('/users/verify', otpLimiter, validate(schemas.verifyOtp), verifyUserOtp);
router.post('/users/register', otpLimiter, validate(schemas.completeUserRegistration), completeUserRegistration);
router.post('/stores/login', loginLimiter, validate(schemas.storeLogin), loginStore);
router.get('/me', authenticate(), getCurrentAccount);

export default router;
