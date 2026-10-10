import mongoose from 'mongoose';

const webhookEventSchema = new mongoose.Schema({
  razorpayEventId: { type: String, required: true, unique: true, trim: true },
  receivedAt: { type: Date, default: Date.now },
  processed: { type: Boolean, default: false },
  processedAt: { type: Date }
});

const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema);
export default WebhookEvent;
