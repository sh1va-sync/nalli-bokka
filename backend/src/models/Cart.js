// import mongoose from 'mongoose';

// const cartItemSchema = new mongoose.Schema({
//   productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
//   // Only for oil/rice packs: which pack was chosen (_id of the pack inside the product)
//   packId: { type: mongoose.Schema.Types.ObjectId },
//   // If packId is set  -> number of packs (e.g. 2 x 5 L)
//   // If packId is empty -> weight in GRAMS (250, 500, 750, 1000 ...)
//   quantity: { type: Number, required: true, min: 1 },
// });

// // No total stored here. The total is calculated each time (see utils/pricing.js)
// const cartSchema = new mongoose.Schema(
//   {
//     userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
//     items: [cartItemSchema],
//   },
//   { timestamps: true }
// );

// export default mongoose.model('Cart', cartSchema);


import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  selectionType: {
    type: String,
    required: true,
    enum: ['weight', 'pieces', 'pack']
  },
  selectedQuantity: {
    type: Number,
    min: 0.001,
    required: true,
    validate: {
      validator(value) {
        return this.selectionType === 'weight' || Number.isInteger(value);
      },
      message: 'Piece and pack quantities must be whole numbers'
    }
  },
  selectedPackLabel: {
    type: String,
    trim: true,
    required() {
      return this.selectionType === 'pack';
    }
  }
});

const cartSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: {
    type: [cartItemSchema],
    default: []
  }
}, { timestamps: true });

const Cart = mongoose.model('Cart', cartSchema);

export default Cart;
