// import mongoose from 'mongoose';

// const transactionSchema = new mongoose.Schema(
//   {
//     orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
//     razorpayOrderId: { type: String, required: true, unique: true },
//     paymentId: { type: String }, // razorpay_payment_id, filled after payment
//     razorpaySignature: { type: String }, // kept for records after server-side verification
//     amount: { type: Number, required: true, min: 0 }, // rupees (multiply by 100 for Razorpay)
//     status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created' },
//     timestamp: { type: Date, default: Date.now },
//   },
//   { timestamps: true }
// );

// export default mongoose.model('Transaction', transactionSchema);


import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  razorpayOrderId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  paymentId: {
    type: String,
    sparse: true,
    unique: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['created', 'paid', 'failed'],
    default: 'created'
  },
  refundStatus: {
    type: String,
    enum: ['none', 'pending', 'processed', 'failed'],
    default: 'none'
  },
  refundId: {
    type: String,
    trim: true
  },
  refundRequestId: {
    type: String,
    trim: true
  },
  refundRequestedAt: {
    type: Date
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

transactionSchema.index(
  { orderId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'created' } }
);
transactionSchema.index({ timestamp: -1, status: 1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

export default Transaction;
