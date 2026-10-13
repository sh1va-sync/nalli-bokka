import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

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
});

storeSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

const Store = mongoose.model('Store', storeSchema);

export default Store;


// import mongoose from 'mongoose';
// import bcrypt from 'bcryptjs';

// const storeSchema = new mongoose.Schema(
//   {
//     storeName: { type: String, required: true, trim: true },
//     username: { type: String, required: true, unique: true, lowercase: true, trim: true },
//     // select: false -> the password is never returned unless you ask for it with .select('+password')
//     password: { type: String, required: true, minlength: 8, select: false },
//     location: {
//       address: { type: String, required: true, trim: true },
//       latitude: Number,
//       longitude: Number,
//     },
//   },
//   { timestamps: true }
// );

// // Hash the password before saving (only when it was set or changed)
// storeSchema.pre('save', async function () {
//   if (!this.isModified('password')) return;
//   this.password = await bcrypt.hash(this.password, 10);
// });

// // Use for store login: const store = await Store.findOne({ username }).select('+password');
// storeSchema.methods.comparePassword = function (candidatePassword) {
//   return bcrypt.compare(candidatePassword, this.password);
// };

// export default mongoose.model('Store', storeSchema);