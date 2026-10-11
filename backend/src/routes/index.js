import { Router } from 'express';
import authRoutes from './authRoutes.js';
import cartRoutes from './cartRoutes.js';
import healthController, { readinessController } from '../controllers/healthController.js';
import orderRoutes from './orderRoutes.js';
import paymentRoutes from './paymentRoutes.js';
import productRoutes from './productRoutes.js';
import publicStoreRoutes from './publicStoreRoutes.js';
import storeRoutes from './storeRoutes.js';
import userRoutes from './userRoutes.js';

const router = Router();

router.get('/health', healthController);
router.get('/health/ready', readinessController);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/products', productRoutes);
router.use('/stores', publicStoreRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/store', storeRoutes);

export default router;
