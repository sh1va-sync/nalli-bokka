import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  _id: String,
  revokedBefore: Date,
  expiresAt: { type: Date, required: true }
}, { versionKey: false });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('RevokedToken', schema);
