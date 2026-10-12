import Notification from '../models/Notification.js';
import Order from '../models/Order.js';
import Transaction from '../models/Transaction.js';
import AppError from '../utils/AppError.js';

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
