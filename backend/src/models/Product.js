import mongoose from 'mongoose';
import { BUILT_IN_PRODUCT_TYPES } from '../utils/productTypes.js';

const packSchema = new mongoose.Schema({
  label: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false });

const productSchema = new mongoose.Schema({
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true,
    index: true
  },
  productType: {
    type: String,
    required: true,
    trim: true,
    maxlength: 40
  },
  pricingMode: {
    type: String,
    enum: ['weight', 'pack']
  },
  productName: {
    type: String,
    required: true,
    trim: true
  },
  imageUrl: {
    type: String,
    required: true,
    trim: true
  },
  imagePublicId: {
    type: String,
    trim: true,
    maxlength: 255
  },
  inStock: {
    type: Boolean,
    default: true
  },
  pricePerKg: {
    type: Number,
    min: 0
  },
  pieceWeightGrams: {
    type: Number,
    min: 0.001
  },
  packs: {
    type: [packSchema],
    default: []
  }
}, { timestamps: true });

productSchema.pre('validate', function validatePricing() {
  const hasWeightPrice = this.pricePerKg !== undefined && this.pricePerKg !== null;
  const hasPacks = this.packs.length > 0;
  const packLabels = this.packs.map(pack => (pack.label || '').toLowerCase());

  if (new Set(packLabels).size !== packLabels.length) {
    this.invalidate('packs', 'Pack labels must be unique within a product');
  }

  if (!BUILT_IN_PRODUCT_TYPES.includes(this.productType) && !this.pricingMode) {
    this.invalidate('pricingMode', 'Custom categories require a pricing mode');
  }

  const pricingMode = this.pricingMode
    || (this.productType === 'oil' ? 'pack' : this.productType === 'rice' && hasPacks ? 'pack' : 'weight');
  if (pricingMode === 'weight' && (!hasWeightPrice || hasPacks)) {
    this.invalidate('pricePerKg', 'Weight-priced products require pricePerKg and cannot have packs');
  }
  if (pricingMode === 'pack' && (!hasPacks || hasWeightPrice)) {
    this.invalidate('packs', 'Pack-priced products require packs and cannot use pricePerKg');
  }

  if (!this.pricingMode && this.productType === 'rice' && hasWeightPrice === hasPacks) {
    this.invalidate('pricePerKg', 'Rice must use either pricePerKg for loose rice or packs for packaged rice');
  }
});

productSchema.index({ storeId: 1, productType: 1 });

const Product = mongoose.model('Product', productSchema);

export default Product;
