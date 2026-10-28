import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import Order from '../models/Order.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { recordStoreAudit } from '../services/audit.js';
import { createInvoicePdf } from '../services/invoicePdf.js';

const ORDER_TRANSITIONS = {
  placed: new Set(['packing', 'cancelled']),
  packing: new Set(['out for delivery', 'ready for pickup', 'cancelled']),
  'out for delivery': new Set(['delivered']),
  'ready for pickup': new Set(['picked up']),
  delivered: new Set(),
  'picked up': new Set(),
  cancelled: new Set()
};

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function paginateOrders(filter, page, limit, sort = { createdAt: -1, _id: -1 }, includeProductImages = false) {
  const query = Order.find(filter)
    .populate('storeId', 'storeName location')
    .sort(sort);
  if (includeProductImages) {
    query.populate('items.productId', 'imageUrl productType');
  }
  const [data, total] = await Promise.all([
    query
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments(filter)
  ]);
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function listUserOrders(req, res) {
  const { page, limit, orderStatus, orderType, from, to } = req.validated.query;
  const filter = { userId: req.auth.id };
  if (orderStatus) {
    filter.orderStatus = orderStatus;
  }
  if (orderType) {
    filter.orderType = orderType === 'delivery' ? { $ne: 'pickup' } : orderType;
  }
  if (from) {
    filter.createdAt = { $gte: new Date(from), $lt: new Date(to) };
  }
  res.json(await paginateOrders(filter, page, limit, undefined, true));
}

export async function getUserOrder(req, res) {
  const order = await Order.findOne({
    _id: req.validated.params.orderId,
    userId: req.auth.id
  })
    .populate('storeId', 'storeName location storePhone storeNumber')
    .populate('items.productId', 'imageUrl productType');
  if (!order) {
    throw new AppError(404, 'Order not found');
  }
  const transaction = await Transaction.findOne({
    orderId: order._id,
    refundStatus: { $in: ['pending', 'processed', 'failed'] }
  })
    .sort({ timestamp: -1 })
    .select('amount refundStatus refundId refundRequestedAt timestamp');
  res.json({
    data: {
      ...order.toObject(),
      refund: transaction ? {
        status: transaction.refundStatus,
        amount: transaction.amount,
        reference: transaction.refundId || null,
        requestedAt: transaction.refundRequestedAt || null,
        updatedAt: transaction.timestamp
      } : null
    }
  });
}

export async function downloadUserOrderInvoice(req, res) {
  const order = await Order.findOne({
    _id: req.validated.params.orderId,
    userId: req.auth.id
  })
    .populate('storeId', 'storeName location storePhone storeNumber')
    .populate('userId', 'name phone')
    .select('+invoicePdf +invoiceGeneratedAt');
  if (!order) {
    throw new AppError(404, 'Order not found');
  }
  return sendOrderInvoice(order, res);
}

export async function downloadStoreOrderInvoice(req, res) {
  const order = await Order.findOne({
    _id: req.validated.params.orderId,
    storeId: req.auth.id
  })
    .populate('storeId', 'storeName location storePhone storeNumber')
    .populate('userId', 'name phone')
    .select('+invoicePdf +invoiceGeneratedAt');
  if (!order) {
    throw new AppError(404, 'Order not found');
  }
  return sendOrderInvoice(order, res);
}

async function sendOrderInvoice(order, res) {
  const pdf = await getOrCreateInvoicePdf(order);
  const filename = `invoice-NB-${String(order._id).toUpperCase()}.pdf`;
  res.set({
    'Cache-Control': 'private, no-store',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': pdf.length,
    'Content-Type': 'application/pdf'
  });
  return res.send(pdf);
}

async function getOrCreateInvoicePdf(order) {
  if (order.invoicePdf) {
    return Buffer.from(order.invoicePdf);
  }

  const invoiceGeneratedAt = new Date();
  const pdf = await createInvoicePdf({ ...order.toObject(), invoiceGeneratedAt });
  const result = await Order.updateOne(
    { _id: order._id, invoicePdf: { $exists: false } },
    { $set: { invoicePdf: pdf, invoiceGeneratedAt } },
    { timestamps: false }
  );
  if (result.modifiedCount > 0) {
    return pdf;
  }

  const savedOrder = await Order.findById(order._id).select('+invoicePdf');
  if (!savedOrder?.invoicePdf) {
    throw new AppError(500, 'Invoice PDF could not be saved');
  }
  return Buffer.from(savedOrder.invoicePdf);
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
  const { page, limit, orderStatus, orderType, from, to, search, sort } = req.validated.query;
  const filter = { storeId: req.auth.id };
  if (orderStatus) {
    filter.orderStatus = orderStatus;
  }
  if (orderType) {
    filter.orderType = orderType === 'delivery' ? { $ne: 'pickup' } : orderType;
  }
  if (from) {
    filter.createdAt = { $gte: new Date(from), $lt: new Date(to) };
  }
  const orderSort = {
    newest: { createdAt: -1, _id: -1 },
    oldest: { createdAt: 1, _id: 1 },
    amount_desc: { totalAmount: -1, createdAt: -1, _id: -1 },
    amount_asc: { totalAmount: 1, createdAt: -1, _id: -1 }
  }[sort];

  if (search) {
    const normalizedSearch = search.replace(/^#/, '').trim() || search;
    const customerOrderIds = await Order.distinct('userId', filter);
    const matchingUsers = await User.find({
      _id: { $in: customerOrderIds },
      $or: [
        { name: { $regex: escapeRegex(normalizedSearch), $options: 'i' } },
        { phone: { $regex: escapeRegex(normalizedSearch), $options: 'i' } }
      ]
    }).select('_id');
    const searchAlternatives = [
      { userId: { $in: matchingUsers.map(user => user._id) } },
      { $expr: { $regexMatch: { input: { $toString: '$_id' }, regex: escapeRegex(normalizedSearch), options: 'i' } } }
    ];
    if (/^[a-f\d]{24}$/i.test(normalizedSearch)) {
      searchAlternatives.push({ _id: new mongoose.Types.ObjectId(normalizedSearch) });
    }
    filter.$or = searchAlternatives;
  }

  const result = await paginateOrders(filter, page, limit, orderSort);
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
      const allowedNextStatus = order.orderType === 'pickup' && order.orderStatus === 'packing'
        ? 'ready for pickup'
        : order.orderType === 'delivery' && order.orderStatus === 'packing'
          ? 'out for delivery'
          : order.orderStatus;
      const transitions = order.orderStatus === 'packing'
        ? new Set([allowedNextStatus, 'cancelled'])
        : ORDER_TRANSITIONS[order.orderStatus];
      if (!transitions?.has(nextStatus)) {
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

      const currentStatus = order.orderStatus;
      order.orderStatus = nextStatus;
      await order.save({ session });
      const statusMessages = {
        packing: 'Your order has been accepted and is being prepared.',
        'out for delivery': 'Your order is out for delivery.',
        'ready for pickup': 'Your order is ready for pickup at the store.',
        delivered: 'Your order has been delivered.',
        'picked up': 'Your order has been picked up.',
        cancelled: 'Your order was cancelled by the store.'
      };
      await Notification.create([{
        userId: order.userId,
        orderId: order._id,
        orderStatus: nextStatus,
        title: 'Order status updated',
        message: statusMessages[nextStatus]
      }], { session });
      await recordStoreAudit({
        session,
        req,
        action: 'order.status_updated',
        entityType: 'order',
        entityId: order._id,
        previousState: currentStatus,
        nextState: nextStatus,
        changedFields: ['orderStatus']
      });
      updatedOrder = order;
    });
  } finally {
    await session.endSession();
  }
  res.json({ data: updatedOrder });
}
