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
      ref: 'Collection',
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
        message: "Price must be an integer (store as smallest currency unit)",
      },
    },
    compare_price: {
      type: Number,
      required: [true, "Compare price is required"],
      min: [0, "Compare price cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message:
          "Compare price must be an integer (store as smallest currency unit)",
      },
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
  },
);

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
