import { Router } from 'express';
import { getStore, listStores } from '../controllers/publicStoreController.js';
import validate from '../middleware/validate.js';
import { schemas } from '../validation/schemas.js';

const router = Router();
router.get('/', validate(schemas.storeList), listStores);
router.get('/:id', validate(schemas.idParams), getStore);

export default router;
