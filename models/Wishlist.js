import mongoose from "mongoose";
const { Schema } = mongoose;

const WishlistSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "__v",
  },
);

WishlistSchema.index({ product: 1, user: 1 }, { unique: true });

export default mongoose.model("Wishlist", WishlistSchema);
