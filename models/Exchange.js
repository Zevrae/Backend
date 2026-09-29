import mongoose from "mongoose";
const { Schema } = mongoose;

export const EXCHANGE_STATUSES = [
  "requested", // customer asked, waiting on admin
  "approved", // admin accepted; new item's stock is reserved
  "picked_up", // original item collected from the customer (any due amount collected here, like COD)
  "received", // original item arrived back at the warehouse
  "shipped", // replacement dispatched
  "completed", // replacement delivered
  "rejected", // admin declined
  "cancelled", // cancelled by customer (while requested) or admin
];

export const CLOSED_EXCHANGE_STATUSES = ["completed", "rejected", "cancelled"];

const ExchangeItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    size: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const ExchangeSchema = new Schema(
  {
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    original_item: { type: ExchangeItemSchema, required: true },
    new_item: { type: ExchangeItemSchema, required: true },
    // true when new_item.product === original_item.product — a pure size
    // swap, which is free. Stored as a real field (not derived on the fly)
    // so it's easy to filter/report on later.
    is_size_swap: { type: Boolean, required: true },
    reason: {
      type: String,
      required: [true, "Reason is required"],
      trim: true,
      maxlength: [500, "Reason cannot exceed 500 characters"],
    },
    status: {
      type: String,
      enum: EXCHANGE_STATUSES,
      default: "requested",
      index: true,
    },

    is_open: { type: Boolean, default: true, index: true },
    admin_note: { type: String, trim: true, maxlength: 500 },

    exchange_fee: { type: Number, required: true, min: 0 },

    price_difference: { type: Number, default: 0, min: 0 },
    amount_due: { type: Number, required: true, min: 0 },

    amount_collected: { type: Boolean, default: false },

    // --- Stock bookkeeping ---
    stock_reserved: { type: Boolean, default: false },
    original_restocked: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "__v",
  },
);

ExchangeSchema.pre("validate", function (next) {
  this.is_open = !CLOSED_EXCHANGE_STATUSES.includes(this.status);
  next();
});

ExchangeSchema.index(
  {
    order: 1,
    "original_item.product": 1,
    "original_item.size": 1,
  },
  { unique: true, partialFilterExpression: { is_open: true } },
);

ExchangeSchema.index({ user: 1, created_at: -1 });

export default mongoose.model("Exchange", ExchangeSchema);
