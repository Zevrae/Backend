import mongoose from "mongoose";
const { Schema } = mongoose;

const ProductSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      maxlength: [200, "Name cannot exceed 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
    },
    // NOTE: named `collections` (plural, ObjectId refs) rather than `collection` —
    // `collection` is a reserved property name on Mongoose documents (it holds
    // the underlying MongoDB collection handle), so using it as a schema field
    // triggers a warning and can shadow that internal property. A product can
    // belong to multiple collections (e.g. "New Arrivals" + "Summer Sale").
    collections: {
      type: [Schema.Types.ObjectId],
      ref: "Collection",
      default: [],
      index: true,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
      index: true,
    },
    subcategory: {
      type: String,
      required: [true, "Subcategory is required"],
      trim: true,
      index: true,
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Price must be a whole number of rupees (no decimals/paise)",
      },
    },
    compare_price: {
      type: Number,
      min: [0, "Compare price cannot be negative"],
      validate: {
        validator: (v) => v === undefined || v === null || Number.isInteger(v),
        message:
          "Compare price must be a whole number of rupees (no decimals/paise)",
      },
    },
    // A manual discount percentage override (e.g. for flash sales),
    // independent of compare_price — storefronts can show whichever of the
    // two makes sense, or both.
    discount: {
      type: Number,
      min: [0, "Discount cannot be negative"],
      max: [100, "Discount cannot exceed 100%"],
    },
    images: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr),
        message: "Images must be an array of strings",
      },
    },
    sizes: {
      type: [String],
      default: [],
    },
    status: {
      // Assumption: enum kept flexible since original schema only specified bsonType "string".
      // Adjust this list to match your actual business statuses.
      type: String,
      required: [true, "Status is required"],
      enum: ["active", "inactive", "draft", "archived"],
      default: "draft",
      index: true,
    },
    // Per-size inventory — e.g. { S: 4, M: 10, L: 0 }. `stock_quantity`
    // below is auto-derived from this as the total across all sizes, so
    // API consumers that just want "is there any stock at all" don't need
    // to sum the map themselves.
    size_stock: {
      type: Map,
      of: {
        type: Number,
        min: [0, "Stock quantity cannot be negative"],
        validate: {
          validator: Number.isInteger,
          message: "Stock quantity must be a whole number",
        },
      },
      default: {},
    },
    stock_quantity: {
      // Derived automatically from size_stock in the pre-validate hook below —
      // not meant to be set directly by API callers.
      type: Number,
      default: 0,
      min: [0, "Stock quantity cannot be negative"],
    },
    // Additional fields can be added here as needed

    // --- Soft delete support ---
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
    // Timestamps mapped to created_at / updated_at to match the provided schema
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "__v",
    toJSON: {
      virtuals: true,
      flattenMaps: true,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      flattenMaps: true,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Keep stock_quantity (the "any stock at all" total) in sync with size_stock
// whenever a document is saved directly (create/save — .lean() reads are
// unaffected since there's no document to hook into, but size_stock is
// already the source of truth for those callers too).
ProductSchema.pre("validate", function deriveStockQuantity(next) {
  if (this.size_stock && this.size_stock.size >= 0) {
    let total = 0;
    for (const qty of this.size_stock.values()) {
      total += qty || 0;
    }
    this.stock_quantity = total;
  }
  next();
});

// findOneAndUpdate (used by updateProduct) bypasses document middleware, so
// mirror the derivation here for updates that touch size_stock.
ProductSchema.pre("findOneAndUpdate", function deriveStockQuantityOnUpdate(next) {
  const update = this.getUpdate();
  if (update && update.size_stock !== undefined) {
    const entries = update.size_stock instanceof Map
      ? Array.from(update.size_stock.values())
      : Object.values(update.size_stock || {});
    update.stock_quantity = entries.reduce((sum, qty) => sum + (Number(qty) || 0), 0);
  }
  next();
});

// Compound index for common filtered listing queries (category + subcategory + status)
ProductSchema.index({ category: 1, subcategory: 1, status: 1 });

// Text index for search across name & description
ProductSchema.index({ name: "text", description: "text" });

// Exclude soft-deleted documents from normal find queries by default
function excludeSoftDeleted(next) {
  // Allow callers to explicitly opt into seeing deleted docs via { withDeleted: true } query option
  if (!this.getOptions().withDeleted) {
    this.where({ is_deleted: { $ne: true } });
  }
  next();
}

ProductSchema.pre("find", excludeSoftDeleted);
ProductSchema.pre("findOne", excludeSoftDeleted);
ProductSchema.pre("countDocuments", excludeSoftDeleted);

// Instance method: soft delete
ProductSchema.methods.softDelete = function () {
  this.is_deleted = true;
  this.deleted_at = new Date();
  return this.save();
};

// Instance method: restore
ProductSchema.methods.restore = function () {
  this.is_deleted = false;
  this.deleted_at = null;
  return this.save();
};

export default mongoose.model("Product", ProductSchema);
