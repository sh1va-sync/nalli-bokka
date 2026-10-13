import mongoose from 'mongoose';

const auditEventSchema = new mongoose.Schema({
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Store'
  },
  actorRole: {
    type: String,
    required: true,
    enum: ['store']
  },
  action: {
    type: String,
    required: true,
    enum: [
      'order.status_updated',
      'order.refund_requested',
      'product.created',
      'product.updated',
      'product.deleted',
      'product.stock_updated',
      'store.open_status_updated'
    ]
  },
  entityType: {
    type: String,
    required: true,
    enum: ['order', 'product', 'store']
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  previousState: {
    type: String,
    trim: true,
    maxlength: 100
  },
  nextState: {
    type: String,
    trim: true,
    maxlength: 100
  },
  changedFields: {
    type: [String],
    default: undefined,
    validate: fields => fields.length <= 20
  },
  requestId: {
    type: String,
    trim: true,
    maxlength: 100
  }
}, { timestamps: { createdAt: true, updatedAt: false } });

auditEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 });
auditEventSchema.index({ actorId: 1, createdAt: -1 });
auditEventSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

const AuditEvent = mongoose.model('AuditEvent', auditEventSchema);

export default AuditEvent;
