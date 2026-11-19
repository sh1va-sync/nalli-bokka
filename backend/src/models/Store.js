import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import RevokedToken from './RevokedToken.js';

const storeSchema = new mongoose.Schema({
  storeName: {
    type: String,
    required: true,
    trim: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
    select: false
  },
  location: {
    type: String,
    required: true,
    trim: true
  },
  storePhone: {
    type: String,
    trim: true,
    maxlength: 30,
    default: ''
  },
  storeNumber: {
    type: String,
    trim: true,
    maxlength: 30,
    default: ''
  },
  googleMapsLink: {
    type: String,
    trim: true,
    default: ''
  },
  googleMapLink: {
    type: String,
    trim: true,
    default: ''
  },
  mapLink: {
    type: String,
    trim: true,
    default: ''
  },
  isOpen: {
    type: Boolean,
    default: true
  },
  minimumOrderValue: {
    type: Number,
    min: 0,
    max: 1000000,
    default: 0
  },
  openingTime: {
    type: String,
    required: true,
    default: '09:00',
    match: /^(?:[01]\d|2[0-3]):[03]0$/
  },
  closingTime: {
    type: String,
    required: true,
    default: '21:00',
    match: /^(?:[01]\d|2[0-3]):[03]0$/
  }
}, {
  timestamps: true,
  toJSON: {
    transform(_doc, ret) {
      delete ret.password;
      return ret;
    }
  }
});

storeSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) {
    return;
  }

  this.password = await bcrypt.hash(this.password, 12);
  if (!this.isNew) {
    await RevokedToken.updateOne({ _id: `account:store:${this._id}` }, { $set: {
      revokedBefore: new Date(), expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    } }, { upsert: true, session: this.$session() });
  }
});

storeSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

const Store = mongoose.model('Store', storeSchema);

export default Store;
