import mongoose from 'mongoose';
const { Schema } = mongoose;

// Tracks lightweight demand signals per product:
//  - demandCounter: units actually ordered (incremented in orderController.js)
//  - notifyCounter: "notify me when back in stock" signups on an out-of-stock
//    item (incremented in stockNotificationController.js)
// Kept as two separate counters rather than one combined number on purpose —
// a product with high notifyCounter and low/zero demandCounter is a very
// different inventory signal (real demand going unfulfilled) than one with
// high demandCounter alone, and collapsing them into one number would hide
// exactly that distinction.
const AnalysisSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      unique: true,
      index: true,
    },
    demandCounter: {
      type: Number,
      default: 0,
      min: 0,
    },
    notifyCounter: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: '__v',
  }
);

export default mongoose.model('Analysis', AnalysisSchema);
