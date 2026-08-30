import mongoose from "mongoose";
const { Schema } = mongoose;

// One box per view, expressed as FRACTIONS (0–1) of the stage image —
// mirrors the print-area convention from the Zeurae customization editor,
// so the frontend can draw the gold print-area outline straight off this
// data without any unit conversion.
const PrintAreaBoxSchema = new Schema(
  {
    left: { type: Number, required: true, min: 0, max: 1 },
    top: { type: Number, required: true, min: 0, max: 1 },
    width: { type: Number, required: true, min: 0, max: 1 },
    height: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false },
);

// A single sellable color variant of a blank garment: its own front/back
// template photography and its own per-size stock. Two different colors of
// the same cloth type are NOT interchangeable stock — a black tee selling
// out doesn't touch white tee stock.
const ColorVariantSchema = new Schema(
  {
    id: {
      type: String,
      required: [true, "Color id is required"],
      trim: true,
      lowercase: true,
    },
    label: { type: String, required: [true, "Color label is required"], trim: true },
    hex: { type: String, default: "#111111", trim: true },
    images: {
      front: { type: String, default: null },
      back: { type: String, default: null },
    },
    // Keyed by size (must be one of the parent doc's `sizes`).
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
  },
  { _id: false },
);

const CustomizableGarmentSchema = new Schema(
  {
    // Slug identifying the cloth type, e.g. "tshirt" — stable id used by
    // the frontend editor and by generated Product.customization records.
    cloth_type: {
      type: String,
      required: [true, "Cloth type is required"],
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    label: { type: String, required: [true, "Label is required"], trim: true }, // "T-Shirt"

    // Price (whole rupees, same convention as Product.price) charged for
    // any design generated on this cloth type, regardless of color/size.
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Price must be a whole number of rupees (no decimals/paise)",
      },
    },

    sizes: {
      type: [String],
      default: ["S", "M", "L", "XL", "XXL"],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "At least one size is required",
      },
    },

    colors: {
      type: [ColorVariantSchema],
      default: [],
      validate: {
        validator: function (arr) {
          const ids = arr.map((c) => c.id);
          return new Set(ids).size === ids.length;
        },
        message: "Color ids must be unique within a cloth type",
      },
    },

    print_areas: {
      front: { type: PrintAreaBoxSchema, required: true },
      back: { type: PrintAreaBoxSchema, required: true },
    },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
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

export default mongoose.model("CustomizableGarment", CustomizableGarmentSchema);
