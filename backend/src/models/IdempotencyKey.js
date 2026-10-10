import mongoose from 'mongoose';

const idempotencySchema = new mongoose.Schema({
  key: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  status: { type: String, enum: ['in_progress', 'done', 'failed'], default: 'in_progress' },
  createdAt: { type: Date, default: Date.now }
});

idempotencySchema.index({ key: 1, userId: 1 }, { unique: true });

const IdempotencyKey = mongoose.model('IdempotencyKey', idempotencySchema);
export default IdempotencyKey;
