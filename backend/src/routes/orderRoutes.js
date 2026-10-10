import { Router } from 'express';
import {
  cancelUserOrder,
  createOrder,
  getUserOrder,
  listUserOrders
} from '../controllers/orderController.js';
import { createPaymentOrder } from '../controllers/paymentController.js';
import authenticate from '../middleware/authenticate.js';
import validate from '../middleware/validate.js';
import { schemas } from '../validation/schemas.js';

const router = Router();
router.use(authenticate('user'));
router.post('/', validate(schemas.orderCreate), createOrder);
router.get('/', validate(schemas.orderList), listUserOrders);
router.get('/:orderId', validate(schemas.orderParams), getUserOrder);
router.post('/:orderId/payment', validate(schemas.paymentCreate), createPaymentOrder);
router.post('/:orderId/cancel', validate(schemas.orderParams), cancelUserOrder);

export default router;
