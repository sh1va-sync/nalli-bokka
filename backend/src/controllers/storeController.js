import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Transaction from '../models/Transaction.js';
import AppError from '../utils/AppError.js';
import escapeRegex from '../utils/escapeRegex.js';

const PRODUCT_FIELDS = [
  'productType',
  'productName',
  'imageUrl',
  'inStock',
  'pricePerKg',
  'pieceWeightGrams',
  'packs'
];

export async function createProduct(req, res) {
  const product = await Product.create({
    ...req.validated.body,
    storeId: req.auth.id
  });
  res.status(201).json({ data: product });
}

export async function listStoreProducts(req, res) {
  const { page, limit, productType, search } = req.validated.query;
  const filter = { storeId: req.auth.id };
  if (productType) {
    filter.productType = productType;
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
  const product = await Product.findOne({
    _id: req.validated.params.productId,
    storeId: req.auth.id
  });
  if (!product) {
    throw new AppError(404, 'Product not found');
  }

  for (const field of PRODUCT_FIELDS) {
    if (req.validated.body[field] !== undefined) {
      if (['pricePerKg', 'pieceWeightGrams'].includes(field) && req.validated.body[field] === null) {
        product.set(field, undefined);
      } else {
        product.set(field, req.validated.body[field]);
      }
    }
  }
  await product.save();
  res.json({ data: product });
}

export async function deleteProduct(req, res) {
  const product = await Product.findOneAndDelete({
    _id: req.validated.params.productId,
    storeId: req.auth.id
  });
  if (!product) {
    throw new AppError(404, 'Product not found');
  }
  res.status(204).end();
}

export async function updateStock(req, res) {
  const product = await Product.findOne({
    _id: req.validated.params.productId,
    storeId: req.auth.id
  });
  if (!product) {
    throw new AppError(404, 'Product not found');
  }
  product.inStock = req.validated.body.inStock;
  await product.save();
  res.json({ data: product });
}

export async function getDashboard(req, res) {
  const storeId = req.auth.id;
  const since = new Date(Date.now() - req.validated.query.days * 24 * 60 * 60 * 1000);
  const [products, orderCounts, revenue, recentOrders] = await Promise.all([
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
          paymentStatus: 'paid',
          createdAt: { $gte: since }
        }
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' }, orders: { $sum: 1 } } }
    ]),
    Order.find({ storeId }).sort({ createdAt: -1 }).limit(10).populate('userId', 'name phone')
  ]);

  res.json({
    data: {
      inventory: {
        inStock: products.find(group => group._id === true)?.count || 0,
        outOfStock: products.find(group => group._id === false)?.count || 0
      },
      ordersByStatus: Object.fromEntries(orderCounts.map(group => [group._id, group.count])),
      paidRevenue: {
        sinceDays: req.validated.query.days,
        amount: revenue[0]?.total || 0,
        orders: revenue[0]?.orders || 0
      },
      recentOrders
    }
  });
}

export async function listStoreTransactions(req, res) {
  const { page, limit, status } = req.validated.query;
  const storeId = new mongoose.Types.ObjectId(req.auth.id);
  const match = { 'order.storeId': storeId };
  if (status) {
    match.status = status;
  }

  const [result] = await Transaction.aggregate([
    {
      $lookup: {
        from: Order.collection.name,
        localField: 'orderId',
        foreignField: '_id',
        as: 'order'
      }
    },
    { $unwind: '$order' },
    { $match: match },
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
        timestamp: 1
      }
    }
  ]);

  if (!transaction) {
    throw new AppError(404, 'Transaction not found');
  }
  res.json({ data: transaction });
}

function productStoreId(id) {
  return new mongoose.Types.ObjectId(id);
}
