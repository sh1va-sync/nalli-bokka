import { createHash } from 'node:crypto';
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  _id: String,
  hits: Number,
  expiresAt: Date
}, { versionKey: false });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const RateLimitBucket = mongoose.model('RateLimitBucket', schema);

// Fixed windows, shared atomically across API replicas. TTL is cleanup only.
export default class MongoRateLimitStore {
  localKeys = false;
  constructor(prefix) { this.prefix = prefix; }
  init({ windowMs }) { this.windowMs = windowMs; }
  bucket(key) {
    const window = Math.floor(Date.now() / this.windowMs);
    const digest = createHash('sha256').update(key).digest('hex');
    return { id: `${this.prefix}:${window}:${digest}`, resetTime: new Date((window + 1) * this.windowMs) };
  }
  async increment(key) {
    const { id, resetTime } = this.bucket(key);
    const update = { $inc: { hits: 1 }, $setOnInsert: { expiresAt: resetTime } };
    let bucket;
    try {
      bucket = await RateLimitBucket.findOneAndUpdate({ _id: id }, update, { upsert: true, new: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
      bucket = await RateLimitBucket.findOneAndUpdate({ _id: id }, update, { new: true });
    }
    return { totalHits: bucket.hits, resetTime };
  }
  async decrement(key) {
    await RateLimitBucket.updateOne({ _id: this.bucket(key).id, hits: { $gt: 0 } }, { $inc: { hits: -1 } });
  }
  async resetKey(key) { await RateLimitBucket.deleteOne({ _id: this.bucket(key).id }); }
}
