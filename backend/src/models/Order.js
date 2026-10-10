// import mongoose from 'mongoose';
// import crypto from 'crypto';

// export const ORDER_STATUSES = ['placed', 'packing', 'out_for_delivery', 'delivered', 'cancelled'];
// export const PAYMENT_STATUSES = ['pending', 'paid', 'failed'];

// // Everything below is COPIED at order time, so later price/name changes don't affect old orders
// const orderItemSchema = new mongoose.Schema(
//   {
//     productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
//     productName: { type: String, required: true },
//     label: { type: String, required: true }, // "500 g" or "5 L"
//     quantity: { type: Number, required: true }, // grams, or number of packs
//     price: { type: Number, required: true }, // total price for this line, in rupees
//   },
//   { _id: false }
// );

// const deliveryAddressSchema = new mongoose.Schema(
//   {
//     name: { type: String, required: true },
//     phone: { type: String, required: true },
//     fullAddress: { type: String, required: true },
//     landmark: String,
//     pincode: { type: String, required: true },
//   },
//   { _id: false }
// );

// const orderSchema = new mongoose.Schema(
//   {
//     orderNumber: { type: String, unique: true }, // e.g. NB-261007-4F2A
//     userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
//     storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
//     deliveryAddress: { type: deliveryAddressSchema, required: true },
//     items: {
//       type: [orderItemSchema],
//       validate: [(items) => items.length > 0, 'An order needs at least one item'],
//     },
//     totalAmount: { type: Number, required: true, min: 0 }, // rupees
//     orderStatus: { type: String, enum: ORDER_STATUSES, default: 'placed' },
//     paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },
//   },
//   { timestamps: true }
// );

// // Create a readable order number automatically
// orderSchema.pre('validate', function () {
//   if (this.orderNumber) return;
//   const d = new Date();
//   const date = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
//   this.orderNumber = `NB-${date}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
// });

// export default mongoose.model('Order', orderSchema);

import mongoose from 'mongoose';

const deliveryAddressSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true },
  fullAddress: { type: String, required: true, trim: true },
  landmark: { type: String, trim: true, default: '' },
  pincode: { type: String, required: true, trim: true, match: /^\d{6}$/ }
}, { _id: false });

const orderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productName: {
    type: String,
    required: true,
    trim: true
  },
  selectionType: {
    type: String,
    required: true,
    enum: ['weight', 'pieces', 'pack']
  },
  quantity: {
    type: Number,
    min: 0.001,
    required: true,
    validate: {
      validator(value) {
        return this.selectionType === 'weight' || Number.isInteger(value);
      },
      message: 'Piece and pack quantities must be whole numbers'
    }
  },
  packLabel: {
    type: String,
    trim: true,
    required() {
      return this.selectionType === 'pack';
    }
  },
  price: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true,
    index: true
  },
  deliveryAddress: {
    type: deliveryAddressSchema,
    required: true
  },
  items: {
    type: [orderItemSchema],
    required: true,
    validate: {
      validator: items => items.length > 0,
      message: 'An order must contain at least one item'
    }
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  orderStatus: {
    type: String,
    enum: ['placed', 'packing', 'out for delivery', 'delivered', 'cancelled'],
    default: 'placed'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending'
  }
}, { timestamps: true });

orderSchema.pre('validate', function calculateTotalAmount() {
  if (this.items.length > 0 && this.items.every(item => Number.isFinite(item.price))) {
    const totalInCents = this.items.reduce((sum, item) => sum + Math.round(item.price * 100), 0);
    this.totalAmount = totalInCents / 100;
  }
});

orderSchema.index({ storeId: 1, createdAt: -1 });
orderSchema.index({ userId: 1, createdAt: -1 });

const Order = mongoose.model('Order', orderSchema);

export default Order;
