// import mongoose from 'mongoose';

// export const PRODUCT_TYPES = ['meat', 'vegetable', 'fruit', 'oil', 'rice'];
// const WEIGHT_BASED_TYPES = ['meat', 'vegetable', 'fruit'];

// // Used for oil and rice: each pack has its own price
// const packSchema = new mongoose.Schema({
//   label: { type: String, required: true, trim: true }, // "1 L", "5 L", "25 kg"
//   price: { type: Number, required: true, min: 0 }, // rupees
// });

// const productSchema = new mongoose.Schema(
//   {
//     storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
//     productType: { type: String, enum: PRODUCT_TYPES, required: true },
//     productName: { type: String, required: true, trim: true },
//     imageUrl: { type: String, trim: true },
//     inStock: { type: Boolean, default: true }, // owner switches off when sold out
//     pricePerKg: { type: Number, min: 0 }, // meat, vegetable, fruit (and loose rice)
//     packs: [packSchema], // oil, rice
//   },
//   { timestamps: true }
// );

// // Make sure each product type has the price information it needs
// productSchema.pre('validate', function () {
//   const { productType, pricePerKg, packs } = this;

//   if (WEIGHT_BASED_TYPES.includes(productType) && !pricePerKg) {
//     this.invalidate('pricePerKg', 'pricePerKg is required for meat, vegetable and fruit');
//   }
//   if (productType === 'oil' && packs.length === 0) {
//     this.invalidate('packs', 'Oil needs at least one pack with a price');
//   }
//   if (productType === 'rice' && !pricePerKg && packs.length === 0) {
//     this.invalidate('packs', 'Rice needs packs, or pricePerKg for loose rice');
//   }
// });

// export default mongoose.model('Product', productSchema);

import mongoose from 'mongoose';

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
    enum: ['meat', 'vegetable', 'fruit', 'oil', 'rice']
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

  if (['meat', 'vegetable', 'fruit'].includes(this.productType)) {
    if (!hasWeightPrice || hasPacks) {
      this.invalidate('pricePerKg', 'Meat, vegetables, and fruit require pricePerKg and cannot have packs');
    }
    return;
  }

  if (this.productType === 'oil' && (!hasPacks || hasWeightPrice)) {
    this.invalidate('packs', 'Oil products require packs and cannot use pricePerKg');
  }

  if (this.productType === 'rice' && hasWeightPrice === hasPacks) {
    this.invalidate('pricePerKg', 'Rice must use either pricePerKg for loose rice or packs for packaged rice');
  }
});

productSchema.index({ storeId: 1, productType: 1 });

const Product = mongoose.model('Product', productSchema);

export default Product;
