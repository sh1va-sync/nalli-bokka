import Product from '../models/Product.js';
import AppError from '../utils/AppError.js';
import escapeRegex from '../utils/escapeRegex.js';

export async function listProducts(req, res) {
  const { page, limit, storeId, productType, search } = req.validated.query;
  const filter = { inStock: true };
  if (storeId) {
    filter.storeId = storeId;
  }
  if (productType) {
    filter.productType = productType;
  }
  if (search) {
    filter.productName = { $regex: escapeRegex(search), $options: 'i' };
  }

  const [data, total] = await Promise.all([
    Product.find(filter)
      .populate('storeId', 'storeName location')
      .sort({ productName: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Product.countDocuments(filter)
  ]);

  res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

export async function getProduct(req, res) {
  const product = await Product.findOne({ _id: req.validated.params.id, inStock: true })
    .populate('storeId', 'storeName location');
  if (!product) {
    throw new AppError(404, 'Product not found');
  }
  res.json({ data: product });
}
