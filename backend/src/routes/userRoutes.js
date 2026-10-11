import { Router } from 'express';
import {
  addAddress,
  deleteAddress,
  getProfile,
  updateAddress,
  updateProfile
} from '../controllers/userController.js';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from '../controllers/notificationController.js';
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
router.get('/me/notifications', validate(schemas.notificationList), listNotifications);
router.patch('/me/notifications/read-all', markAllNotificationsRead);
router.patch('/me/notifications/:notificationId/read', validate(schemas.notificationParams), markNotificationRead);

export default router;
