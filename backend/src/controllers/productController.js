import Product from '../models/Product.js';
import ProductCategory from '../models/ProductCategory.js';
import AppError from '../utils/AppError.js';
import escapeRegex from '../utils/escapeRegex.js';

export async function listProductCategories(req, res) {
  const { storeId } = req.validated.query;
  const filter = { isDeleted: { $ne: true } };
  if (storeId) filter.storeId = storeId;
  const categories = await ProductCategory.find(filter).select('name imageUrl -_id').sort({ name: 1 }).lean();
  const customNames = categories.map(category => category.name);
  const images = storeId
    ? Object.fromEntries(categories.filter(category => category.imageUrl).map(({ name, imageUrl }) => [name, imageUrl]))
    : {};
  res.json({
    data: [...new Set(customNames)].sort(),
    images
  });
}

export async function listProducts(req, res) {
  const { page, limit, storeId, productType, search } = req.validated.query;
  const filter = {};
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
  const product = await Product.findById(req.validated.params.id)
    .populate('storeId', 'storeName location');
  if (!product) {
    throw new AppError(404, 'Product not found');
  }
  res.json({ data: product });
}
