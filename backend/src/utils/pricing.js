import AppError from './AppError.js';
import { getLegacyPricingMode } from './productTypes.js';

function roundToPaise(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function priceSelection(product, selectionType, quantity, packLabel) {
  if (!product.inStock) {
    throw new AppError(409, `${product.productName} is currently out of stock`);
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new AppError(400, 'Quantity must be a positive number');
  }

  let lineTotal;
  let normalizedPackLabel;
  const pricingMode = product.pricingMode || getLegacyPricingMode(product);

  if (selectionType === 'weight') {
    if (pricingMode !== 'weight') {
      throw new AppError(400, `${product.productName} is not sold by weight`);
    }
    lineTotal = product.pricePerKg * quantity;
  } else if (selectionType === 'pieces') {
    if (pricingMode !== 'weight' || !product.pieceWeightGrams) {
      throw new AppError(400, `${product.productName} is not configured for piece-based sales`);
    }
    if (!Number.isInteger(quantity)) {
      throw new AppError(400, 'Piece quantity must be a whole number');
    }
    lineTotal = product.pricePerKg * (product.pieceWeightGrams / 1000) * quantity;
  } else if (selectionType === 'pack') {
    if (!Number.isInteger(quantity)) {
      throw new AppError(400, 'Pack quantity must be a whole number');
    }
    const pack = product.packs.find(candidate => candidate.label === packLabel);
    if (!pack) {
      throw new AppError(400, `The selected pack is not available for ${product.productName}`);
    }
    normalizedPackLabel = pack.label;
    lineTotal = pack.price * quantity;
  } else {
    throw new AppError(400, 'selectionType must be weight, pieces, or pack');
  }

  const roundedLineTotal = roundToPaise(lineTotal);
  return {
    selectionType,
    quantity,
    packLabel: normalizedPackLabel,
    lineTotal: roundedLineTotal
  };
}

export { priceSelection, roundToPaise };
