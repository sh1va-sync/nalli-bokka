import { Router } from 'express';
import {
  addCartItems,
  addCartItem,
  clearCart,
  getCart,
  removeCartItem,
  reorderUserOrder,
  updateCartItem
} from '../controllers/cartController.js';
import authenticate from '../middleware/authenticate.js';
import validate from '../middleware/validate.js';
import { schemas } from '../validation/schemas.js';

const router = Router();
router.use(authenticate('user'));
router.get('/', getCart);
router.delete('/items', clearCart);
router.post('/reorder/:orderId', validate(schemas.reorderOrderParams), reorderUserOrder);
router.post('/items/bulk', validate(schemas.cartItemsCreate), addCartItems);
router.post('/items', validate(schemas.cartItemCreate), addCartItem);
router.patch('/items/:itemId', validate(schemas.cartItemUpdate), updateCartItem);
router.delete('/items/:itemId', validate(schemas.cartItemParams), removeCartItem);

export default router;
