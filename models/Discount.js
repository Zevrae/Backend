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
    // Which rule caps redemption:
    //  - 'uses': a fixed total number of redemptions (usage.limit), for as
    //    long as the code stays Active and hasn't passed its expiry.
    //  - 'time': unlimited redemptions, but only until the expiry date —
    //    usage.limit is ignored for this mode.
    limit_type: {
      type: String,
      enum: ['uses', 'time'],
      default: 'uses',
    },
    usage: {
      used: { type: Number, default: 0, min: 0 },
      limit: {
        type: Number,
        min: 1,
        // Only required for 'uses'-mode codes; a 'time'-mode code has no
        // redemption cap so a limit is meaningless for it.
        required: function () {
          return this.limit_type !== 'time';
        },
      },
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
// expiry date, and — for 'uses'-mode codes only — hasn't hit its usage
// limit. 'time'-mode codes have unlimited redemptions up until expiry.
DiscountSchema.methods.isRedeemable = function () {
  if (this.status !== 'Active' || this.expiry <= new Date()) return false;
  if (this.limit_type === 'time') return true;
  return this.usage.used < this.usage.limit;
};

// Computes the discount amount for a given subtotal (same integer smallest-
// currency-unit convention used by Product.price / Order.total).
DiscountSchema.methods.calculateDiscountAmount = function (subtotal) {
  const raw = this.type === 'Percentage' ? Math.round((subtotal * this.value) / 100) : this.value;
  return Math.max(0, Math.min(raw, subtotal));
};

export default mongoose.model('Discount', DiscountSchema);
