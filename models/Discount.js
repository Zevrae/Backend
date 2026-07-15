import mongoose from 'mongoose';
const { Schema } = mongoose;

const DiscountSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true, // normalize so "save20" and "SAVE20" are the same code
    },
    type: {
      type: String,
      enum: ['Percentage', 'Fixed Amount'],
      required: true,
    },
    value: {
      type: Number,
      required: true,
      min: [0, 'Value cannot be negative'],
      validate: {
        validator: function (v) {
          // A percentage discount above 100% makes no sense
          return this.type !== 'Percentage' || v <= 100;
        },
        message: 'Percentage value cannot exceed 100',
      },
    },
    usage: {
      used: { type: Number, default: 0, min: 0 },
      limit: { type: Number, required: true, min: 1 },
    },
    expiry: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['Active', 'Expired'],
      default: 'Active',
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

function excludeSoftDeleted(next) {
  if (!this.getOptions().withDeleted) {
    this.where({ is_deleted: { $ne: true } });
  }
  next();
}
DiscountSchema.pre('find', excludeSoftDeleted);
DiscountSchema.pre('findOne', excludeSoftDeleted);
DiscountSchema.pre('countDocuments', excludeSoftDeleted);

DiscountSchema.methods.softDelete = function () {
  this.is_deleted = true;
  this.deleted_at = new Date();
  return this.save();
};

// True if the code is currently redeemable: marked Active, not past its
// expiry date, and hasn't hit its usage limit.
DiscountSchema.methods.isRedeemable = function () {
  return this.status === 'Active' && this.expiry > new Date() && this.usage.used < this.usage.limit;
};

// Computes the discount amount for a given subtotal (same integer smallest-
// currency-unit convention used by Product.price / Order.total).
DiscountSchema.methods.calculateDiscountAmount = function (subtotal) {
  const raw = this.type === 'Percentage' ? Math.round((subtotal * this.value) / 100) : this.value;
  return Math.max(0, Math.min(raw, subtotal));
};

export default mongoose.model('Discount', DiscountSchema);
