// import mongoose from 'mongoose';

// const addressSchema = new mongoose.Schema({
//   label: { type: String, trim: true, default: 'Home' }, // Home, Work, etc.
//   fullAddress: { type: String, required: true, trim: true },
//   landmark: { type: String, trim: true },
//   pincode: { type: String, required: true, trim: true },
// });

// const userSchema = new mongoose.Schema(
//   {
//     name: { type: String, required: true, trim: true },
//     phone: { type: String, required: true, unique: true, trim: true },
//     email: { type: String, lowercase: true, trim: true },
//     addresses: [addressSchema], // a user can save several addresses
//   },
//   { timestamps: true }
// );

// export default mongoose.model('User', userSchema);

import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema({
  label: {
    type: String,
    required: true,
    trim: true
  },
  fullAddress: {
    type: String,
    required: true,
    trim: true
  },
  landmark: {
    type: String,
    trim: true,
    default: ''
  },
  pincode: {
    type: String,
    required: true,
    trim: true,
    match: /^\d{6}$/
  }
}, { _id: true });

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  addresses: {
    type: [addressSchema],
    default: []
  }
}, { timestamps: true });

userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } }
);

const User = mongoose.model('User', userSchema);

export default User;
