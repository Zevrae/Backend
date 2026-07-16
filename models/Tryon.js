import { schema, model } from "mongoose";

const tryonSchema = new schema({
  userId: {
    type: String,
    required: true,
  },
  imageUrl: {
    type: String,
    required: true,
  },
  productId: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Tryon = model("Tryon", tryonSchema);

export default Tryon;
