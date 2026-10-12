import mongoose from 'mongoose';

const checkoutItemSchema = new mongoose.Schema({
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
    required: true,
    min: 0.001
  },
  packLabel: {
    type: String,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false });

const checkoutAttemptSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true
  },
  deliveryAddress: {
    label: { type: String, required: true, trim: true },
    fullAddress: { type: String, required: true, trim: true },
    landmark: { type: String, trim: true, default: '' },
    pincode: { type: String, required: true, trim: true, match: /^\d{6}$/ }
  },
  items: {
    type: [checkoutItemSchema],
    required: true,
    validate: items => items.length > 0
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  idempotencyKey: {
    type: String,
    required: true,
    trim: true
  },
  razorpayOrderId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  paymentId: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'failed', 'paid'],
    default: 'pending'
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    unique: true,
    sparse: true
  }
}, { timestamps: true });

checkoutAttemptSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
checkoutAttemptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

const CheckoutAttempt = mongoose.model('CheckoutAttempt', checkoutAttemptSchema);

export default CheckoutAttempt;
