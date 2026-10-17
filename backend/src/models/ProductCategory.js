import mongoose from 'mongoose';

const productCategorySchema = new mongoose.Schema({
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 40
  },
  normalizedName: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    maxlength: 40
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

productCategorySchema.index({ storeId: 1, normalizedName: 1 }, { unique: true });

export default mongoose.model('ProductCategory', productCategorySchema);
