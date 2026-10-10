import { Router } from 'express';
import {
  createProduct,
  deleteProduct,
  getDashboard,
  getStoreTransaction,
  listStoreProducts,
  listStoreTransactions,
  updateProduct,
  updateStock
} from '../controllers/storeController.js';
import {
  getStoreOrder,
  listStoreOrders,
  updateStoreOrderStatus
} from '../controllers/orderController.js';
import authenticate from '../middleware/authenticate.js';
import validate from '../middleware/validate.js';
import { schemas } from '../validation/schemas.js';

const router = Router();
router.use(authenticate('store'));

router.get('/dashboard', validate(schemas.dashboard), getDashboard);
router.get('/products', validate(schemas.storeProductList), listStoreProducts);
router.post('/products', validate(schemas.productCreate), createProduct);
router.patch('/products/:productId', validate(schemas.productUpdate), updateProduct);
router.patch('/products/:productId/stock', validate(schemas.stockUpdate), updateStock);
router.delete('/products/:productId', validate(schemas.productParams), deleteProduct);
router.get('/orders', validate(schemas.orderList), listStoreOrders);
router.get('/orders/:orderId', validate(schemas.orderParams), getStoreOrder);
router.patch('/orders/:orderId/status', validate(schemas.orderStatusUpdate), updateStoreOrderStatus);
router.get('/transactions', validate(schemas.transactionList), listStoreTransactions);
router.get('/transactions/:transactionId', validate(schemas.transactionParams), getStoreTransaction);

export default router;
