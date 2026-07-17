import mongoose from "mongoose";
const { Schema } = mongoose;

// Stores the result of a virtual try-on generation: which user requested it,
// which product's garment image was used, and the resulting composited
// image URL returned by the external try-on microservice.
const TryonSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    imageUrl: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "__v",
  },
);

TryonSchema.index({ user: 1, created_at: -1 });

export default mongoose.model("Tryon", TryonSchema);
