import { Schema, model } from "mongoose";

const DiscountSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["Percentage", "Fixed Amount"],
      required: true,
    },
    value: {
      type: Number,
      required: true,
    },
    usage: {
      used: { type: Number, default: 0 },
      limit: { type: Number, required: true },
    },
    expiry: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["Active", "Expired"],
      default: "Active",
    },
  },
  { timestamps: true },
);

export default model("Discount", DiscountSchema);
