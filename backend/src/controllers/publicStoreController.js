import Store from '../models/Store.js';
import AppError from '../utils/AppError.js';
import escapeRegex from '../utils/escapeRegex.js';
import { getIndiaDateString, getPickupSlots } from '../utils/pickupSlots.js';

export async function listStores(req, res) {
  const { page, limit, search } = req.validated.query;
  const filter = search
    ? { storeName: { $regex: escapeRegex(search), $options: 'i' } }
    : {};
  const [data, total] = await Promise.all([
    Store.find(filter)
      .select('storeName location storePhone storeNumber googleMapsLink googleMapLink mapLink isOpen openingTime closingTime')
      .sort({ storeName: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Store.countDocuments(filter)
  ]);
  res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

export async function getStore(req, res) {
  const store = await Store.findById(req.validated.params.id).select('storeName location storePhone storeNumber googleMapsLink googleMapLink mapLink isOpen openingTime closingTime');
  if (!store) {
    throw new AppError(404, 'Store not found');
  }
  res.json({ data: store });
}

export async function listPickupSlots(req, res) {
  const store = await Store.findById(req.validated.params.id).select('isOpen openingTime closingTime');
  if (!store) {
    throw new AppError(404, 'Store not found');
  }
  if (!store.isOpen) {
    throw new AppError(409, 'This store is not currently accepting orders');
  }
  const date = req.validated.query.date || getIndiaDateString();
  const slots = getPickupSlots({
    date,
    openingTime: store.openingTime,
    closingTime: store.closingTime
  });
  res.json({
    data: {
      date,
      timeZone: 'Asia/Kolkata',
      slots
    }
  });
}
