import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  orderStatus: {
    type: String,
    required: true,
    enum: ['placed', 'packing', 'out for delivery', 'ready for pickup', 'delivered', 'picked up', 'cancelled']
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  readAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ orderId: 1, orderStatus: 1 }, { unique: true });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
