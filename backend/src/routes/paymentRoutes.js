import { Router } from 'express';
import {
  createCheckoutPayment,
  markCheckoutPaymentFailed,
  verifyPayment
} from '../controllers/paymentController.js';
import authenticate from '../middleware/authenticate.js';
import validate from '../middleware/validate.js';
import { schemas } from '../validation/schemas.js';

const router = Router();
router.post('/razorpay/order', authenticate('user'), validate(schemas.checkoutPaymentCreate), createCheckoutPayment);
router.post(
  '/razorpay/:razorpayOrderId/failed',
  authenticate('user'),
  validate(schemas.checkoutAttemptParams),
  markCheckoutPaymentFailed
);
router.post('/razorpay/verify', authenticate('user'), validate(schemas.paymentVerify), verifyPayment);

export default router;
