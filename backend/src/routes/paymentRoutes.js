import { Router } from 'express';
import { verifyPayment } from '../controllers/paymentController.js';
import authenticate from '../middleware/authenticate.js';
import validate from '../middleware/validate.js';
import { schemas } from '../validation/schemas.js';

const router = Router();
router.post('/razorpay/verify', authenticate('user'), validate(schemas.paymentVerify), verifyPayment);

export default router;
