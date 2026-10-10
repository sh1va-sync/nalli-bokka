import { Router } from 'express';
import {
  addAddress,
  deleteAddress,
  getProfile,
  updateAddress,
  updateProfile
} from '../controllers/userController.js';
import authenticate from '../middleware/authenticate.js';
import validate from '../middleware/validate.js';
import { schemas } from '../validation/schemas.js';

const router = Router();
router.use(authenticate('user'));

router.get('/me', getProfile);
router.patch('/me', validate(schemas.profileUpdate), updateProfile);
router.post('/me/addresses', validate(schemas.address), addAddress);
router.patch('/me/addresses/:addressId', validate(schemas.addressUpdate), updateAddress);
router.delete('/me/addresses/:addressId', validate(schemas.addressParams), deleteAddress);

export default router;
