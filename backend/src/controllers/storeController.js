import mongoose from 'mongoose';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import AuditEvent from '../models/AuditEvent.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import ProductCategory from '../models/ProductCategory.js';
import Store from '../models/Store.js';
import Transaction from '../models/Transaction.js';
import AppError from '../utils/AppError.js';
import escapeRegex from '../utils/escapeRegex.js';
import { BUILT_IN_PRODUCT_TYPES } from '../utils/productTypes.js';
import { roundToPaise } from '../utils/pricing.js';
import { recordStoreAudit } from '../services/audit.js';

const PRODUCT_FIELDS = [
  'productType',
  'pricingMode',
  'productName',
  'imageUrl',
  'inStock',
  'pricePerKg',
  'pieceWeightGrams',
  'packs'
];

async function assertStoreProductType(productType, storeId, session) {
  const normalizedType = productType.toLowerCase();
  if (BUILT_IN_PRODUCT_TYPES.includes(normalizedType)) return normalizedType;
  const category = await ProductCategory.exists({ storeId, normalizedName: normalizedType }).session(session);
  if (!category) {
    throw new AppError(400, 'Create this category before adding products to it');
  }
  return normalizedType;
}

export async function listStoreProductCategories(req, res) {
  const categories = await ProductCategory.find({ storeId: req.auth.id }).select('name -_id').sort({ name: 1 }).lean();
  res.json({ data: [...BUILT_IN_PRODUCT_TYPES, ...categories.map(category => category.name)] });
}

export async function createStoreProductCategory(req, res) {
  const name = req.validated.body.name.trim().toLowerCase();
  if (BUILT_IN_PRODUCT_TYPES.includes(name)) {
    throw new AppError(409, 'That category already exists');
  }

  const session = await ProductCategory.db.startSession();
  let category;
  try {
    await session.withTransaction(async () => {
      const exists = await ProductCategory.exists({
        storeId: req.auth.id,
        normalizedName: name
      }).session(session);
      if (exists) {
        throw new AppError(409, 'That category already exists');
      }
      [category] = await ProductCategory.create([{
        storeId: req.auth.id,
        name,
        normalizedName: name
      }], { session });
      await recordStoreAudit({
        session,
        req,
        action: 'product.category.created',
        entityType: 'productCategory',
        entityId: category._id,
        changedFields: ['name']
      });
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new AppError(409, 'That category already exists');
    }
    throw error;
  } finally {
    await session.endSession();
  }
  res.status(201).json({ data: { name: category.name } });
}

export async function listStoreAuditEvents(req, res) {
  const { page, limit } = req.validated.query;
  const filter = { actorId: req.auth.id };
  const [data, total] = await Promise.all([
    AuditEvent.find(filter)
      .select('action entityType entityId previousState nextState changedFields requestId createdAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    AuditEvent.countDocuments(filter)
  ]);
  res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

export async function createProduct(req, res) {
  const session = await Product.db.startSession();
  let product;
  try {
    await session.withTransaction(async () => {
      const productType = await assertStoreProductType(req.validated.body.productType, req.auth.id, session);
      [product] = await Product.create([{
        ...req.validated.body,
        productType,
        storeId: req.auth.id
      }], { session });
      await recordStoreAudit({
        session,
        req,
        action: 'product.created',
        entityType: 'product',
        entityId: product._id,
        changedFields: Object.keys(req.validated.body)
      });
    });
  } finally {
    await session.endSession();
  }
  res.status(201).json({ data: product });
}

export async function listStoreProducts(req, res) {
  const { page, limit, productType, search, inStock, pricingMode } = req.validated.query;
  const filter = { storeId: req.auth.id };
  if (productType) {
    filter.productType = productType;
  }
  if (inStock !== undefined) {
    filter.inStock = inStock;
  }
  if (pricingMode === 'weight') {
    filter.$or = [
      { pricingMode: 'weight' },
      { pricingMode: { $exists: false }, productType: { $in: ['meat', 'vegetable', 'fruit'] } },
      { pricingMode: { $exists: false }, productType: 'rice', pricePerKg: { $exists: true } }
    ];
  } else if (pricingMode === 'pack') {
    filter.$or = [
      { pricingMode: 'pack' },
      { pricingMode: { $exists: false }, productType: 'oil' },
      { pricingMode: { $exists: false }, productType: 'rice', packs: { $exists: true, $ne: [] } }
    ];
  }
  if (search) {
    filter.productName = { $regex: escapeRegex(search), $options: 'i' };
  }
  const [data, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Product.countDocuments(filter)
  ]);
  res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

export async function updateProduct(req, res) {
  const session = await Product.db.startSession();
  let product;
  try {
    await session.withTransaction(async () => {
      product = await Product.findOne({
        _id: req.validated.params.productId,
        storeId: req.auth.id
      }).session(session);
      if (!product) {
        throw new AppError(404, 'Product not found');
      }

      if (req.validated.body.productType !== undefined) {
        req.validated.body.productType = await assertStoreProductType(
          req.validated.body.productType,
          req.auth.id,
          session
        );
      }
      const changedFields = PRODUCT_FIELDS.filter(field => req.validated.body[field] !== undefined);
      for (const field of changedFields) {
        if (['pricePerKg', 'pieceWeightGrams'].includes(field) && req.validated.body[field] === null) {
          product.set(field, undefined);
        } else {
          product.set(field, req.validated.body[field]);
        }
      }
      await product.save({ session });
      await recordStoreAudit({
        session,
        req,
        action: 'product.updated',
        entityType: 'product',
        entityId: product._id,
        changedFields
      });
    });
  } finally {
    await session.endSession();
  }
  res.json({ data: product });
}

export async function deleteProduct(req, res) {
  const session = await Product.db.startSession();
  try {
    await session.withTransaction(async () => {
      const product = await Product.findOneAndDelete({
        _id: req.validated.params.productId,
        storeId: req.auth.id
      }, { session });
      if (!product) {
        throw new AppError(404, 'Product not found');
      }
      await recordStoreAudit({
        session,
        req,
        action: 'product.deleted',
        entityType: 'product',
        entityId: product._id,
        changedFields: ['deleted']
      });
    });
  } finally {
    await session.endSession();
  }
  res.status(204).end();
}

export async function updateStock(req, res) {
  const session = await Product.db.startSession();
  let product;
  try {
    await session.withTransaction(async () => {
      product = await Product.findOne({
        _id: req.validated.params.productId,
        storeId: req.auth.id
      }).session(session);
      if (!product) {
        throw new AppError(404, 'Product not found');
      }
      const previousState = String(product.inStock);
      product.inStock = req.validated.body.inStock;
      await product.save({ session });
      await recordStoreAudit({
        session,
        req,
        action: 'product.stock_updated',
        entityType: 'product',
        entityId: product._id,
        previousState,
        nextState: String(product.inStock),
        changedFields: ['inStock']
      });
    });
  } finally {
    await session.endSession();
  }
  res.json({ data: product });
}

export async function updateStoreStatus(req, res) {
  const session = await Store.db.startSession();
  let store;
  try {
    await session.withTransaction(async () => {
      store = await Store.findById(req.auth.id).session(session);
      if (!store) {
        throw new AppError(404, 'Store not found');
      }

      const { isOpen } = req.validated.body;
      const previousState = String(store.isOpen);
      store.isOpen = isOpen;
      await store.save({ session });
      await recordStoreAudit({
        session,
        req,
        action: 'store.open_status_updated',
        entityType: 'store',
        entityId: store._id,
        previousState,
        nextState: String(store.isOpen),
        changedFields: ['isOpen']
      });
    });
  } finally {
    await session.endSession();
  }

  res.json({
    data: {
      _id: store._id,
      storeName: store.storeName,
      isOpen: store.isOpen,
      storePhone: store.storePhone || store.storeNumber,
      googleMapsLink: store.googleMapsLink || store.googleMapLink || store.mapLink,
      location: store.location
    }
  });
}

export async function getDashboard(req, res) {
  const storeId = req.auth.id;
  const { days, from, to } = req.validated.query;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const period = from ? { $gte: new Date(from), $lt: new Date(to) } : null;
  const [products, orderCounts, revenue, recentOrders, periodOrderCount, periodTransactions] = await Promise.all([
    Product.aggregate([
      { $match: { storeId: productStoreId(storeId) } },
      { $group: { _id: '$inStock', count: { $sum: 1 } } }
    ]),
    Order.aggregate([
      { $match: { storeId: productStoreId(storeId) } },
      { $group: { _id: '$orderStatus', count: { $sum: 1 } } }
    ]),
    Order.aggregate([
      {
        $match: {
          storeId: productStoreId(storeId),
          paymentStatus: { $in: ['paid', 'refund_pending', 'refund_failed'] },
          createdAt: { $gte: since }
        }
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' }, orders: { $sum: 1 } } }
    ]),
    Order.find({ storeId }).sort({ createdAt: -1 }).limit(10).populate('userId', 'name phone'),
    period ? Order.countDocuments({ storeId, createdAt: period }) : null,
    period ? Transaction.aggregate([
      { $match: { timestamp: period } },
      {
        $lookup: {
          from: Order.collection.name,
          localField: 'orderId',
          foreignField: '_id',
          as: 'order'
        }
      },
      { $unwind: '$order' },
      { $match: { 'order.storeId': productStoreId(storeId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          paidAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'paid'] },
                    { $ne: ['$refundStatus', 'processed'] }
                  ]
                },
                '$amount',
                0
              ]
            }
          }
        }
      }
    ]) : []
  ]);

  const transactionCounts = Object.fromEntries(
    periodTransactions.map(group => [group._id, group.count])
  );
  const paidRevenue = roundToPaise(
    periodTransactions.find(group => group._id === 'paid')?.paidAmount || 0
  );

  res.json({
    data: {
      inventory: {
        inStock: products.find(group => group._id === true)?.count || 0,
        outOfStock: products.find(group => group._id === false)?.count || 0
      },
      ordersByStatus: Object.fromEntries(orderCounts.map(group => [group._id, group.count])),
      paidRevenue: {
        sinceDays: days,
        amount: revenue[0]?.total || 0,
        orders: revenue[0]?.orders || 0
      },
      ...(period ? {
        periodMetrics: {
          from,
          to,
          orders: periodOrderCount,
          paidRevenue,
          paidTransactions: transactionCounts.paid || 0,
          transactions: {
            created: transactionCounts.created || 0,
            paid: transactionCounts.paid || 0,
            failed: transactionCounts.failed || 0
          }
        }
      } : {}),
      recentOrders
    }
  });
}

export async function listStoreTransactions(req, res) {
  const { page, limit, status, from, to } = req.validated.query;
  const storeId = new mongoose.Types.ObjectId(req.auth.id);
  const transactionFilter = {
    ...(from ? { timestamp: { $gte: new Date(from), $lt: new Date(to) } } : {})
  };
  if (status) {
    transactionFilter.status = status;
  }

  const [result] = await Transaction.aggregate([
    { $match: transactionFilter },
    {
      $lookup: {
        from: Order.collection.name,
        localField: 'orderId',
        foreignField: '_id',
        as: 'order'
      }
    },
    { $unwind: '$order' },
    { $match: { 'order.storeId': storeId } },
    {
      $facet: {
        data: [
          { $sort: { timestamp: -1 } },
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $project: {
              orderId: 1,
              razorpayOrderId: 1,
              paymentId: 1,
              amount: 1,
              status: 1,
              refundStatus: 1,
              refundId: 1,
              timestamp: 1
            }
          }
        ],
        total: [{ $count: 'count' }]
      }
    }
  ]);
  const data = result?.data || [];
  const total = result?.total[0]?.count || 0;
  res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

export async function getStoreTransaction(req, res) {
  const transactionId = new mongoose.Types.ObjectId(req.validated.params.transactionId);
  const [transaction] = await Transaction.aggregate([
    { $match: { _id: transactionId } },
    {
      $lookup: {
        from: Order.collection.name,
        localField: 'orderId',
        foreignField: '_id',
        as: 'order'
      }
    },
    { $unwind: '$order' },
    { $match: { 'order.storeId': new mongoose.Types.ObjectId(req.auth.id) } },
    {
      $project: {
        orderId: 1,
        razorpayOrderId: 1,
        paymentId: 1,
        amount: 1,
        status: 1,
        refundStatus: 1,
        refundId: 1,
        timestamp: 1
      }
    }
  ]);

  if (!transaction) {
    throw new AppError(404, 'Transaction not found');
  }
  res.json({ data: transaction });
}

export async function exportStoreReport(req, res, next) {
  const { type, from, to } = req.validated.query;
  const storeId = new mongoose.Types.ObjectId(req.auth.id);
  const period = { $gte: new Date(from), $lt: new Date(to) };
  const headers = type === 'orders'
    ? ['order_id', 'created_at', 'order_status', 'payment_status', 'total_amount', 'items']
    : ['timestamp', 'order_id', 'status', 'amount', 'refund_status', 'refund_id'];
  const filename = `store-${type}-${from.slice(0, 10)}-to-${to.slice(0, 10)}.csv`;
  const cursor = type === 'orders'
    ? Order.find({ storeId, createdAt: period })
      .select('createdAt orderStatus paymentStatus totalAmount items')
      .sort({ createdAt: -1 })
      .cursor({ batchSize: 500 })
    : Transaction.aggregate([
      { $match: { timestamp: period } },
      {
        $lookup: {
          from: Order.collection.name,
          localField: 'orderId',
          foreignField: '_id',
          as: 'order'
        }
      },
      { $unwind: '$order' },
      { $match: { 'order.storeId': storeId } },
      { $sort: { timestamp: -1 } },
      { $project: { orderId: 1, status: 1, amount: 1, refundStatus: 1, refundId: 1, timestamp: 1 } }
    ]).cursor({ batchSize: 500 });

  let firstRow;
  try {
    firstRow = await cursor.next();
  } catch (error) {
    return next(error);
  }

  res.status(200)
    .type('text/csv')
    .set('Content-Disposition', `attachment; filename="${filename}"`)
    .set('Cache-Control', 'no-store');

  async function* csvRows() {
    yield `\uFEFF${headers.join(',')}\r\n`;
    if (firstRow) yield serializeReportRow(type, firstRow);
    for await (const row of cursor) {
      yield serializeReportRow(type, row);
    }
  }

  try {
    await pipeline(Readable.from(csvRows()), res);
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      event: 'store.report.export.failed',
      requestId: req.requestId,
      reportType: type,
      message: error.message,
      stack: error.stack
    }));
    if (!res.destroyed) res.destroy(error);
  }
}

function productStoreId(id) {
  return new mongoose.Types.ObjectId(id);
}

function serializeReportRow(type, row) {
  const values = type === 'orders'
    ? [
      row._id,
      row.createdAt.toISOString(),
      row.orderStatus,
      row.paymentStatus,
      row.totalAmount,
      row.items.map(item => `${item.productName} x ${item.quantity}${item.packLabel ? ` ${item.packLabel}` : ''}`).join('; ')
    ]
    : [row.timestamp.toISOString(), row.orderId, row.status, row.amount, row.refundStatus || 'none', row.refundId];
  return `${values.map(csvCell).join(',')}\r\n`;
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
