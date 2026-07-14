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
