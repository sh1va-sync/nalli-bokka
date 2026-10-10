import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import AppError from '../utils/AppError.js';
import { priceSelection, roundToPaise } from '../utils/pricing.js';

async function buildCartResponse(cart) {
  const products = await Product.find({
    _id: { $in: cart.items.map(item => item.productId) }
  });
  const byId = new Map(products.map(product => [String(product._id), product]));
  let totalCents = 0;
  const items = cart.items.map(item => {
    const product = byId.get(String(item.productId));
    if (!product) {
      return {
        itemId: item._id,
        productId: item.productId,
        available: false,
        issue: 'Product no longer exists'
      };
    }

    try {
      const priced = priceSelection(
        product,
        item.selectionType,
        item.selectedQuantity,
        item.selectedPackLabel
      );
      totalCents += Math.round(priced.lineTotal * 100);
      return {
        itemId: item._id,
        productId: product._id,
        productName: product.productName,
        imageUrl: product.imageUrl,
        selectionType: item.selectionType,
        selectedQuantity: item.selectedQuantity,
        selectedPackLabel: item.selectedPackLabel,
        available: true,
        unitPrice: item.selectionType === 'pack'
          ? product.packs.find(pack => pack.label === item.selectedPackLabel).price
          : item.selectionType === 'pieces'
            ? product.pricePerKg * product.pieceWeightGrams / 1000
            : product.pricePerKg,
        lineTotal: priced.lineTotal
      };
    } catch (error) {
      if (!(error instanceof AppError) || ![400, 409].includes(error.status)) {
        throw error;
      }
      return {
        itemId: item._id,
        productId: product._id,
        productName: product.productName,
        selectionType: item.selectionType,
        selectedQuantity: item.selectedQuantity,
        selectedPackLabel: item.selectedPackLabel,
        available: false,
        issue: error.message
      };
    }
  });

  const hasUnavailableItems = items.some(item => !item.available);
  return {
    items,
    total: hasUnavailableItems ? null : roundToPaise(totalCents / 100),
    hasUnavailableItems
  };
}

export async function getCart(req, res) {
  const cart = await Cart.findOne({ userId: req.auth.id });
  if (!cart) {
    return res.json({ data: { items: [], total: 0, hasUnavailableItems: false } });
  }
  return res.json({ data: await buildCartResponse(cart) });
}

export async function addCartItem(req, res) {
  const { productId, selectionType, selectedQuantity, selectedPackLabel } = req.validated.body;
  const product = await Product.findById(productId);
  if (!product) {
    throw new AppError(404, 'Product not found');
  }
  priceSelection(product, selectionType, selectedQuantity, selectedPackLabel);

  let cart = await Cart.findOne({ userId: req.auth.id });
  if (!cart) {
    cart = await Cart.create({ userId: req.auth.id, items: [] });
  }
  const existing = cart.items.find(item => (
    String(item.productId) === productId
    && item.selectionType === selectionType
    && item.selectedPackLabel === selectedPackLabel
  ));
  if (existing) {
    const combinedQuantity = existing.selectedQuantity + selectedQuantity;
    priceSelection(product, selectionType, combinedQuantity, selectedPackLabel);
    existing.selectedQuantity = combinedQuantity;
  } else {
    cart.items.push({ productId, selectionType, selectedQuantity, selectedPackLabel });
  }
  await cart.save();
  res.status(201).json({ data: await buildCartResponse(cart) });
}

export async function updateCartItem(req, res) {
  const cart = await Cart.findOne({ userId: req.auth.id });
  const item = cart?.items.id(req.validated.params.itemId);
  if (!item) {
    throw new AppError(404, 'Cart item not found');
  }

  const product = await Product.findById(item.productId);
  if (!product) {
    throw new AppError(404, 'Product not found');
  }
  const { selectionType, selectedQuantity, selectedPackLabel } = req.validated.body;
  priceSelection(product, selectionType, selectedQuantity, selectedPackLabel);
  item.selectionType = selectionType;
  item.selectedQuantity = selectedQuantity;
  item.selectedPackLabel = selectedPackLabel;
  await cart.save();
  res.json({ data: await buildCartResponse(cart) });
}

export async function removeCartItem(req, res) {
  const cart = await Cart.findOne({ userId: req.auth.id });
  const item = cart?.items.id(req.validated.params.itemId);
  if (!cart || !item) {
    throw new AppError(404, 'Cart item not found');
  }
  item.deleteOne();
  await cart.save();
  res.json({ data: await buildCartResponse(cart) });
}

export { buildCartResponse };
