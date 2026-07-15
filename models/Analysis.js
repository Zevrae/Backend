import mongoose from 'mongoose';
const { Schema } = mongoose;

// Tracks a lightweight demand signal per product (currently incremented
// whenever a unit of the product is ordered — see orderController.js).
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
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: '__v',
  }
);

export default mongoose.model('Analysis', AnalysisSchema);
