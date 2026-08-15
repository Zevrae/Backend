import mongoose from "mongoose";
const { Schema } = mongoose;

const CartItemSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    name: { type: String, required: true }, // snapshot at time of add
    price: { type: Number, required: true, min: 0 }, // snapshot at time of add
    size: { type: String },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Quantity must be at least 1"],
      default: 1,
    },
  },
  { _id: true },
);

const CartSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    items: {
      type: [CartItemSchema],
      default: [],
    },
    // ADDED: Temporary holding area for checkout data to prevent ghost orders
    // while the user is completing their online Razorpay payment.
    checkout_state: {
      razorpay_order_id: { type: String },
      shipping_address: { type: Schema.Types.Mixed }, // Mixed type to accept the address object
      discount_code: { type: String, default: null },
      discount_amount: { type: Number, default: 0 },
      handling_fee: { type: Number, default: 0 },
      shipping_fee: { type: Number, default: 0 },
      subtotal: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "__v",
  },
);

CartSchema.virtual("subtotal").get(function () {
  return this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
});
CartSchema.set("toJSON", { virtuals: true });
CartSchema.set("toObject", { virtuals: true });

export default mongoose.model("Cart", CartSchema);
