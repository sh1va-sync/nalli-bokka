import { Router } from 'express';
import { getProduct, listProducts } from '../controllers/productController.js';
import validate from '../middleware/validate.js';
import { schemas } from '../validation/schemas.js';

const router = Router();
router.get('/', validate(schemas.productList), listProducts);
router.get('/:id', validate(schemas.idParams), getProduct);

export default router;
