import mongoose from 'mongoose';
const { Schema } = mongoose;

const ReviewSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    // Public Appwrite view URLs for any photos the reviewer attached
    // (e.g. photos of themselves wearing/using the product).
    images: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length <= 5,
        message: "A review can have at most 5 images",
      },
    },
    is_deleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deleted_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: '__v',
  }
);

// One review per user per product
ReviewSchema.index({ product: 1, user: 1 }, { unique: true });

function excludeSoftDeleted(next) {
  if (!this.getOptions().withDeleted) {
    this.where({ is_deleted: { $ne: true } });
  }
  next();
}
ReviewSchema.pre('find', excludeSoftDeleted);
ReviewSchema.pre('findOne', excludeSoftDeleted);
ReviewSchema.pre('countDocuments', excludeSoftDeleted);

ReviewSchema.methods.softDelete = function () {
  this.is_deleted = true;
  this.deleted_at = new Date();
  return this.save();
};

export default mongoose.model('Review', ReviewSchema);
