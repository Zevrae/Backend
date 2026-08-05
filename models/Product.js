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

    // Inventory mode: either "size" or "nosize"
    inventory_mode: {
      type: String,
      enum: ["size", "nosize"],
      required: true,
      default: "nosize",
    },

    // Sizes only matter if inventory_mode === "size"
    sizes: {
      type: [String],
      default: [],
      validate: {
        validator: function (arr) {
          if (this.inventory_mode === "size" && (!arr || arr.length === 0)) {
            return false;
          }
          if (this.inventory_mode === "nosize" && arr.length > 0) {
            return false;
          }
          return true;
        },
        message:
          "Sizes must be provided when inventory_mode is 'size', and must be empty when 'nosize'.",
      },
    },

    // Unified stock map: either keyed by size ("S","M","L","Custom") or "nosize"
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
      type: Number,
      default: 0,
      min: [0, "Stock quantity cannot be negative"],
    },

    status: {
      type: String,
      required: [true, "Status is required"],
      enum: ["active", "inactive", "draft", "archived"],
      default: "draft",
      index: true,
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

// Keep stock_quantity in sync with size_stock
ProductSchema.pre("validate", function (next) {
  if (this.size_stock) {
    let total = 0;
    for (const qty of this.size_stock.values()) {
      total += qty || 0;
    }
    this.stock_quantity = total;
  }
  next();
});

ProductSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate();
  if (update && update.size_stock !== undefined) {
    const entries = update.size_stock instanceof Map
      ? Array.from(update.size_stock.values())
      : Object.values(update.size_stock || {});
    update.stock_quantity = entries.reduce(
      (sum, qty) => sum + (Number(qty) || 0),
      0
    );
  }
  next();
});

// Indexes
ProductSchema.index({ category: 1, subcategory: 1, status: 1 });
ProductSchema.index({ name: "text", description: "text" });

// Soft delete query middleware
function excludeSoftDeleted(next) {
  if (!this.getOptions().withDeleted) {
    this.where({ is_deleted: { $ne: true } });
  }
  next();
}
ProductSchema.pre("find", excludeSoftDeleted);
ProductSchema.pre("findOne", excludeSoftDeleted);
ProductSchema.pre("countDocuments", excludeSoftDeleted);

// Instance methods
ProductSchema.methods.softDelete = function () {
  this.is_deleted = true;
  this.deleted_at = new Date();
  return this.save();
};

ProductSchema.methods.restore = function () {
  this.is_deleted = false;
  this.deleted_at = null;
  return this.save();
};

export default mongoose.model("Product", ProductSchema);
