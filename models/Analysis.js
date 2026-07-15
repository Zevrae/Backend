import { schema, model } from "mongoose";

const analysisSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    demandCounter: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

const Analysis = model("Analysis", analysisSchema);

export default Analysis;
