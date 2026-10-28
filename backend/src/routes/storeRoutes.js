import { Router } from 'express';
import {
  createProduct,
  createStoreProductCategory,
  deleteStoreProductCategory,
  deleteProduct,
  exportStoreReport,
  getDashboard,
  listStoreAuditEvents,
  listStoreProductCategories,
  getStoreTransaction,
  listStoreProducts,
  listStoreTransactions,
  updateProduct,
  updateStock,
  updateStoreStatus,
  updateStoreHours
} from '../controllers/storeController.js';
import {
  downloadStoreOrderInvoice,
  getStoreOrder,
  listStoreOrders,
  updateStoreOrderStatus
} from '../controllers/orderController.js';
import { refundStoreOrder } from '../controllers/paymentController.js';
import authenticate from '../middleware/authenticate.js';
import { receiveCategoryImage, validateCategoryImage } from '../middleware/categoryImageUpload.js';
import { parseProductMultipartData, receiveProductImage, requireProductImage } from '../middleware/productImageUpload.js';
import validate from '../middleware/validate.js';
import { schemas } from '../validation/schemas.js';

const router = Router();
router.use(authenticate('store'));

router.patch('/status', validate(schemas.storeStatusUpdate), updateStoreStatus);
router.patch('/hours', validate(schemas.storeHoursUpdate), updateStoreHours);
router.get('/dashboard', validate(schemas.dashboard), getDashboard);
router.get('/audit-events', validate(schemas.storeAuditEventList), listStoreAuditEvents);
router.get('/product-categories', validate(schemas.storeProductCategoryList), listStoreProductCategories);
router.post('/product-categories', receiveCategoryImage, validateCategoryImage, validate(schemas.storeProductCategoryCreate), createStoreProductCategory);
router.delete('/product-categories/:categoryName', validate(schemas.storeProductCategoryDelete), deleteStoreProductCategory);
router.get('/products', validate(schemas.storeProductList), listStoreProducts);
router.post('/products', receiveProductImage, parseProductMultipartData, requireProductImage, validate(schemas.productCreate), createProduct);
router.patch('/products/:productId', receiveProductImage, parseProductMultipartData, validate(schemas.productUpdate), updateProduct);
router.patch('/products/:productId/stock', validate(schemas.stockUpdate), updateStock);
router.delete('/products/:productId', validate(schemas.productParams), deleteProduct);
router.get('/orders', validate(schemas.orderList), listStoreOrders);
router.get('/orders/:orderId/invoice', validate(schemas.orderParams), downloadStoreOrderInvoice);
router.get('/orders/:orderId', validate(schemas.orderParams), getStoreOrder);
router.patch('/orders/:orderId/status', validate(schemas.orderStatusUpdate), updateStoreOrderStatus);
router.post('/orders/:orderId/refund', validate(schemas.storeOrderRefund), refundStoreOrder);
router.get('/transactions', validate(schemas.transactionList), listStoreTransactions);
router.get('/transactions/:transactionId', validate(schemas.transactionParams), getStoreTransaction);
router.get('/reports/export', validate(schemas.storeReportExport), exportStoreReport);

export default router;
