import Cart from '../models/Cart.js';
import IdempotencyKey from '../models/IdempotencyKey.js';
import Notification from '../models/Notification.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { priceSelection, roundToPaise } from '../utils/pricing.js';

const ORDER_TRANSITIONS = {
  placed: new Set(['packing', 'cancelled']),
  packing: new Set(['out for delivery', 'cancelled']),
  'out for delivery': new Set(['delivered']),
  delivered: new Set(),
  cancelled: new Set()
};

async function paginateOrders(filter, page, limit) {
  const [data, total] = await Promise.all([
    Order.find(filter)
      .populate('storeId', 'storeName location')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments(filter)
  ]);
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function createOrder(req, res) {
  const idempotencyKey = (req.get('Idempotency-Key') || '').trim();

  if (idempotencyKey) {
    const existing = await IdempotencyKey.findOne({
      key: idempotencyKey,
      userId: req.auth.id
    });
    if (existing) {
      if (!existing.orderId) {
        throw new AppError(409, 'A checkout with this idempotency key is already in progress');
      }
      const existingOrder = await Order.findById(existing.orderId);
      if (!existingOrder) {
        throw new AppError(409, 'The order associated with this idempotency key no longer exists');
      }
      return res.status(200).json({ data: existingOrder });
    }
  }

  const [user, cart] = await Promise.all([
    User.findById(req.auth.id),
    Cart.findOne({ userId: req.auth.id })
  ]);
  if (!user) {
    throw new AppError(404, 'User not found');
  }
  if (!cart || cart.items.length === 0) {
    throw new AppError(400, 'Your cart is empty');
  }

  const address = user.addresses.id(req.validated.body.addressId);
  if (!address) {
    throw new AppError(404, 'Delivery address not found');
  }

  const products = await Product.find({
    _id: { $in: cart.items.map(item => item.productId) }
  });
  const byId = new Map(products.map(product => [String(product._id), product]));
  const missing = cart.items.find(item => !byId.has(String(item.productId)));
  if (missing) {
    throw new AppError(409, 'A cart product is no longer available; update your cart');
  }

  const storeIds = new Set(products.map(product => String(product.storeId)));
  const selectedStoreId = req.validated.body.storeId || [...storeIds][0];
  if (!storeIds.has(selectedStoreId)) {
    throw new AppError(400, 'The selected store has no products in your cart');
  }
  if (!req.validated.body.storeId && storeIds.size > 1) {
    throw new AppError(409, 'Your cart contains products from multiple stores; specify storeId to check out one store at a time');
  }

  const selectedCartItems = cart.items.filter(item => (
    String(byId.get(String(item.productId)).storeId) === selectedStoreId
  ));
  const items = selectedCartItems.map(item => {
    const product = byId.get(String(item.productId));
    const priced = priceSelection(
      product,
      item.selectionType,
      item.selectedQuantity,
      item.selectedPackLabel
    );
    return {
      productId: product._id,
      productName: product.productName,
      selectionType: priced.selectionType,
      quantity: priced.quantity,
      ...(priced.packLabel ? { packLabel: priced.packLabel } : {}),
      price: priced.lineTotal
    };
  });
  const totalCents = items.reduce((sum, item) => sum + Math.round(item.price * 100), 0);
  if (totalCents <= 0) {
    throw new AppError(400, 'Order total must be greater than zero');
  }

  // Use an idempotency key and MongoDB transaction to make checkout atomic and retry-safe.
  const session = await Order.db.startSession();
  try {
    session.startTransaction();

    // If an idempotency key was provided, check/create a marker so retries return the same order.
    let existingOrder;
    if (idempotencyKey) {
      // Try to find an existing completed idempotency record
      const existing = await IdempotencyKey.findOne({ key: idempotencyKey, userId: user._id }).session(session);
      if (existing) {
        if (existing.orderId) {
          existingOrder = await Order.findById(existing.orderId).session(session);
          await session.commitTransaction();
          return res.status(200).json({ data: existingOrder });
        }
        // if exists but no orderId, it's in_progress - prevent duplicate work by failing fast
        throw new AppError(409, 'A checkout with this idempotency key is already in progress');
      }
      // Create a new idempotency record
      await IdempotencyKey.create([{ key: idempotencyKey, userId: user._id, status: 'in_progress' }], { session });
    }

    // Create the order
    const order = await Order.create([{
      userId: user._id,
      storeId: selectedStoreId,
      deliveryAddress: {
        label: address.label,
        fullAddress: address.fullAddress,
        landmark: address.landmark,
        pincode: address.pincode
      },
      items,
      totalAmount: roundToPaise(totalCents / 100)
    }], { session });

    const createdOrder = order[0];

    // Remove the ordered items from the cart within the same transaction
    cart.items = cart.items.filter(item => (
      String(byId.get(String(item.productId)).storeId) !== selectedStoreId
    ));
    await cart.save({ session });

    // Update idempotency record with the created orderId
    if (idempotencyKey) {
      await IdempotencyKey.updateOne(
        { key: idempotencyKey, userId: user._id },
        { $set: { orderId: createdOrder._id, status: 'done' } },
        { session }
      );
    }

    await session.commitTransaction();
    res.status(201).json({ data: createdOrder });
  } catch (err) {
    await session.abortTransaction();
    // If key conflict happened because of race, return existing
    if (err.code === 11000 && idempotencyKey) {
      const existing = await IdempotencyKey.findOne({ key: idempotencyKey, userId: user._id });
      if (existing && existing.orderId) {
        const existingOrderDoc = await Order.findById(existing.orderId);
        return res.status(200).json({ data: existingOrderDoc });
      }
    }
    throw err;
  } finally {
    session.endSession();
  }
}

export async function listUserOrders(req, res) {
  const { page, limit, orderStatus, from, to } = req.validated.query;
  const filter = { userId: req.auth.id };
  if (orderStatus) {
    filter.orderStatus = orderStatus;
  }
  if (from) {
    filter.createdAt = { $gte: new Date(from), $lt: new Date(to) };
  }
  res.json(await paginateOrders(filter, page, limit));
}

export async function getUserOrder(req, res) {
  const order = await Order.findOne({
    _id: req.validated.params.orderId,
    userId: req.auth.id
  }).populate('storeId', 'storeName location');
  if (!order) {
    throw new AppError(404, 'Order not found');
  }
  res.json({ data: order });
}

export async function cancelUserOrder(req, res) {
  const order = await Order.findOne({
    _id: req.validated.params.orderId,
    userId: req.auth.id
  });
  if (!order) {
    throw new AppError(404, 'Order not found');
  }
  if (!ORDER_TRANSITIONS[order.orderStatus].has('cancelled')) {
    throw new AppError(409, 'This order can no longer be cancelled');
  }
  if (['paid', 'refund_pending', 'refunded', 'refund_failed'].includes(order.paymentStatus)) {
    throw new AppError(409, 'A paid order cannot be cancelled through this API; contact support for a refund');
  }
  if (await Transaction.exists({ orderId: order._id, status: 'created' })) {
    throw new AppError(409, 'A payment attempt is still active; wait for payment confirmation or failure before cancelling');
  }
  order.orderStatus = 'cancelled';
  await order.save();
  res.json({ data: order });
}

export async function listStoreOrders(req, res) {
  const { page, limit, orderStatus, from, to } = req.validated.query;
  const filter = { storeId: req.auth.id };
  if (orderStatus) {
    filter.orderStatus = orderStatus;
  }
  if (from) {
    filter.createdAt = { $gte: new Date(from), $lt: new Date(to) };
  }
  const result = await paginateOrders(filter, page, limit);
  result.data = await Order.populate(result.data, { path: 'userId', select: 'name phone' });
  res.json(result);
}

export async function getStoreOrder(req, res) {
  const order = await Order.findOne({
    _id: req.validated.params.orderId,
    storeId: req.auth.id
  }).populate('userId', 'name phone');
  if (!order) {
    throw new AppError(404, 'Order not found');
  }
  res.json({ data: order });
}

export async function updateStoreOrderStatus(req, res) {
  const nextStatus = req.validated.body.orderStatus;
  const session = await Order.db.startSession();
  let updatedOrder;
  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({
        _id: req.validated.params.orderId,
        storeId: req.auth.id
      }).session(session);
      if (!order) {
        throw new AppError(404, 'Order not found');
      }
      if (!ORDER_TRANSITIONS[order.orderStatus].has(nextStatus)) {
        throw new AppError(409, `Cannot change order status from ${order.orderStatus} to ${nextStatus}`);
      }
      if (order.paymentStatus === 'refund_pending') {
        throw new AppError(409, 'Order fulfillment is paused while the refund is pending');
      }
      if (nextStatus === 'cancelled' && ['paid', 'refunded', 'refund_failed'].includes(order.paymentStatus)) {
        throw new AppError(409, 'A paid order cannot be cancelled through this API; process a refund first');
      }
      if (nextStatus === 'cancelled' && await Transaction.exists({ orderId: order._id, status: 'created' }).session(session)) {
        throw new AppError(409, 'A payment attempt is still active; wait for payment confirmation or failure before cancelling');
      }
      if (nextStatus === 'packing' && !['paid', 'refund_failed'].includes(order.paymentStatus)) {
        throw new AppError(409, 'Payment must be confirmed before packing an order');
      }

      order.orderStatus = nextStatus;
      await order.save({ session });
      const statusMessages = {
        packing: 'Your order has been accepted and is being prepared.',
        'out for delivery': 'Your order is out for delivery.',
        delivered: 'Your order has been delivered.',
        cancelled: 'Your order was cancelled by the store.'
      };
      await Notification.create([{
        userId: order.userId,
        orderId: order._id,
        orderStatus: nextStatus,
        title: 'Order status updated',
        message: statusMessages[nextStatus]
      }], { session });
      updatedOrder = order;
    });
  } finally {
    await session.endSession();
  }
  res.json({ data: updatedOrder });
}
