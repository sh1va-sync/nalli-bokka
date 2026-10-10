import Store from '../models/Store.js';
import AppError from '../utils/AppError.js';
import escapeRegex from '../utils/escapeRegex.js';

export async function listStores(req, res) {
  const { page, limit, search } = req.validated.query;
  const filter = search
    ? { storeName: { $regex: escapeRegex(search), $options: 'i' } }
    : {};
  const [data, total] = await Promise.all([
    Store.find(filter)
      .select('storeName location')
      .sort({ storeName: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Store.countDocuments(filter)
  ]);
  res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

export async function getStore(req, res) {
  const store = await Store.findById(req.validated.params.id).select('storeName location');
  if (!store) {
    throw new AppError(404, 'Store not found');
  }
  res.json({ data: store });
}
