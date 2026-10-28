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
import {
  deleteCategoryImage,
  deleteProductImage,
  uploadCategoryImage,
  uploadProductImage
} from '../services/productImages.js';

const PRODUCT_FIELDS = [
  'productType',
  'pricingMode',
  'productName',
  'imageUrl',
  'imagePublicId',
  'inStock',
  'pricePerKg',
  'pieceWeightGrams',
  'packs'
];

async function assertStoreProductType(productType, storeId, session) {
  const normalizedType = productType.toLowerCase();
  const category = await ProductCategory.findOne({ storeId, normalizedName: normalizedType })
    .select('isDeleted')
    .session(session);
  if (category?.isDeleted || (!category && !BUILT_IN_PRODUCT_TYPES.includes(normalizedType))) {
    throw new AppError(400, 'Create this category before adding products to it');
  }
  return normalizedType;
}

export async function listStoreProductCategories(req, res) {
  const [categories, deletedCategories] = await Promise.all([
    ProductCategory.find({ storeId: req.auth.id, isDeleted: { $ne: true } }).select('name -_id').sort({ name: 1 }).lean(),
    ProductCategory.find({ storeId: req.auth.id, isDeleted: true }).distinct('normalizedName')
  ]);
  const deletedNames = new Set(deletedCategories);
  res.json({
    data: [...BUILT_IN_PRODUCT_TYPES.filter(name => !deletedNames.has(name)), ...categories.map(category => category.name)]
  });
}

export async function createStoreProductCategory(req, res) {
  const name = req.validated.body.name.trim().toLowerCase();

  const session = await ProductCategory.db.startSession();
  let category;
  let image;
  let previousImagePublicId;
  try {
    image = req.file ? await uploadCategoryImage(req.file, req.auth.id) : null;
    await session.withTransaction(async () => {
      const existingCategory = await ProductCategory.findOne({
        storeId: req.auth.id,
        normalizedName: name
      }).session(session);
      if (existingCategory?.isDeleted) {
        existingCategory.isDeleted = false;
        if (image) {
          previousImagePublicId = existingCategory.imagePublicId;
          existingCategory.imageUrl = image.imageUrl;
          existingCategory.imagePublicId = image.imagePublicId;
        }
        category = await existingCategory.save({ session });
        await recordStoreAudit({
          session,
          req,
          action: 'product.category.created',
          entityType: 'productCategory',
          entityId: category._id,
          changedFields: ['name', ...(image ? ['imageUrl', 'imagePublicId'] : [])]
        });
        return;
      }
      if (existingCategory || BUILT_IN_PRODUCT_TYPES.includes(name)) {
        throw new AppError(409, 'That category already exists');
      }
      if (!image) {
        throw new AppError(400, 'Choose a category image file');
      }
      [category] = await ProductCategory.create([{
        storeId: req.auth.id,
        name,
        normalizedName: name,
        ...(image || {})
      }], { session });
      await recordStoreAudit({
        session,
        req,
        action: 'product.category.created',
        entityType: 'productCategory',
        entityId: category._id,
        changedFields: ['name', ...(image ? ['imageUrl', 'imagePublicId'] : [])]
      });
    });
  } catch (error) {
    if (image) {
      try {
        await deleteCategoryImage(image.imagePublicId);
      } catch (cleanupError) {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          event: 'cloudinary.category_image.rollback_cleanup.failed',
          publicId: image.imagePublicId,
          message: cleanupError.message
        }));
      }
    }
    if (error?.code === 11000) {
      throw new AppError(409, 'That category already exists');
    }
    throw error;
  } finally {
    await session.endSession();
  }
  if (previousImagePublicId && image && previousImagePublicId !== image.imagePublicId) {
    try {
      await deleteCategoryImage(previousImagePublicId);
    } catch (cleanupError) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        event: 'cloudinary.category_image.replacement_cleanup.failed',
        publicId: previousImagePublicId,
        message: cleanupError.message
      }));
    }
  }
  res.status(201).json({
    data: {
      name: category.name,
      ...(category.imageUrl ? { imageUrl: category.imageUrl } : {})
    }
  });
}

export async function deleteStoreProductCategory(req, res) {
  const name = req.validated.params.categoryName.trim().toLowerCase();

  const session = await ProductCategory.db.startSession();
  let deletedCategory;
  try {
    await session.withTransaction(async () => {
      let category = await ProductCategory.findOne({
        storeId: req.auth.id,
        normalizedName: name
      }).session(session);
      if (!category && !BUILT_IN_PRODUCT_TYPES.includes(name)) {
        throw new AppError(404, 'Category not found');
      }
      if (category?.isDeleted) {
        throw new AppError(404, 'Category not found');
      }

      const inUse = await Product.exists({
        storeId: req.auth.id,
        productType: name
      }).session(session);
      if (inUse) {
        throw new AppError(409, 'Remove or reassign products in this category before deleting it');
      }

      if (category) {
        category.isDeleted = true;
        deletedCategory = await category.save({ session });
      } else {
        [deletedCategory] = await ProductCategory.create([{
          storeId: req.auth.id,
          name,
          normalizedName: name,
          isDeleted: true
        }], { session });
      }
      await recordStoreAudit({
        session,
        req,
        action: 'product.category.deleted',
        entityType: 'productCategory',
        entityId: deletedCategory._id,
        previousState: category?.name || name,
        changedFields: ['deleted']
      });
    });
  } finally {
    await session.endSession();
  }

  res.json({ data: { name: deletedCategory.name } });
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
  const productType = await assertStoreProductType(req.validated.body.productType, req.auth.id);
  const image = await uploadProductImage(req.file, req.auth.id);
  let session;
  let product;
  try {
    session = await Product.db.startSession();
    await session.withTransaction(async () => {
      const verifiedProductType = await assertStoreProductType(productType, req.auth.id, session);
      [product] = await Product.create([{
        ...req.validated.body,
        ...image,
        productType: verifiedProductType,
        storeId: req.auth.id
      }], { session });
      await recordStoreAudit({
        session,
        req,
        action: 'product.created',
        entityType: 'product',
        entityId: product._id,
        changedFields: [...Object.keys(req.validated.body), 'imageUrl', 'imagePublicId']
      });
    });
  } catch (error) {
    try {
      await deleteProductImage(image.imagePublicId);
    } catch (cleanupError) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        event: 'cloudinary.product_image.rollback_cleanup.failed',
        publicId: image.imagePublicId,
        message: cleanupError.message
      }));
    }
    throw error;
  } finally {
    if (session) await session.endSession();
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
  const existingProduct = await Product.findOne({
    _id: req.validated.params.productId,
    storeId: req.auth.id
  }).select('imagePublicId');
  if (!existingProduct) {
    throw new AppError(404, 'Product not found');
  }

  let image;
  if (req.file) {
    image = await uploadProductImage(req.file, req.auth.id);
  }
  let session;
  let product;
  try {
    session = await Product.db.startSession();
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
      if (image) {
        product.imageUrl = image.imageUrl;
        product.imagePublicId = image.imagePublicId;
        changedFields.push('imageUrl', 'imagePublicId');
      }
      for (const field of changedFields) {
        if (field === 'imageUrl' || field === 'imagePublicId') continue;
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
  } catch (error) {
    if (image) {
      try {
        await deleteProductImage(image.imagePublicId);
      } catch (cleanupError) {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          event: 'cloudinary.product_image.rollback_cleanup.failed',
          publicId: image.imagePublicId,
          message: cleanupError.message
        }));
      }
    }
    throw error;
  } finally {
    if (session) await session.endSession();
  }

  const warnings = [];
  if (image && existingProduct.imagePublicId && existingProduct.imagePublicId !== image.imagePublicId) {
    try {
      await deleteProductImage(existingProduct.imagePublicId);
    } catch (cleanupError) {
      warnings.push(cleanupError.message);
    }
  }
  res.json({ data: product, ...(warnings.length ? { warnings } : {}) });
}

export async function deleteProduct(req, res) {
  const session = await Product.db.startSession();
  let deletedProduct;
  try {
    await session.withTransaction(async () => {
      deletedProduct = await Product.findOneAndDelete({
        _id: req.validated.params.productId,
        storeId: req.auth.id
      }, { session });
      if (!deletedProduct) {
        throw new AppError(404, 'Product not found');
      }
      await recordStoreAudit({
        session,
        req,
        action: 'product.deleted',
        entityType: 'product',
        entityId: deletedProduct._id,
        changedFields: ['deleted']
      });
    });
  } finally {
    await session.endSession();
  }
  if (deletedProduct.imagePublicId) {
    try {
      await deleteProductImage(deletedProduct.imagePublicId);
    } catch (cleanupError) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        event: 'cloudinary.product_image.delete_after_product_removal.failed',
        publicId: deletedProduct.imagePublicId,
        message: cleanupError.message
      }));
    }
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

export async function updateStoreHours(req, res) {
  const session = await Store.db.startSession();
  let store;
  try {
    await session.withTransaction(async () => {
      store = await Store.findById(req.auth.id).session(session);
      if (!store) {
        throw new AppError(404, 'Store not found');
      }
      const previousState = `${store.openingTime}-${store.closingTime}`;
      const { openingTime, closingTime } = req.validated.body;
      store.openingTime = openingTime;
      store.closingTime = closingTime;
      await store.save({ session });
      await recordStoreAudit({
        session,
        req,
        action: 'store.hours_updated',
        entityType: 'store',
        entityId: store._id,
        previousState,
        nextState: `${openingTime}-${closingTime}`,
        changedFields: ['openingTime', 'closingTime']
      });
    });
  } finally {
    await session.endSession();
  }
  res.json({ data: store });
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
