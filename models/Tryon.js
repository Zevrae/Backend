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
      // No longer required at creation time — a job starts as 'pending'
      // with no image yet, and gets one once generation finishes.
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
      index: true,
    },
    error: {
      type: String,
    },
    // Which of the product's garment images (by URL) were used as input for
    // this generation — useful for showing "what was combined" in history.
    clothImageUrls: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "__v",
  },
);

TryonSchema.index({ user: 1, created_at: -1 });

export default mongoose.model("Tryon", TryonSchema);
