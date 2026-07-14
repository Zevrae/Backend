import mongoose from "mongoose";
const { Schema } = mongoose;

const CategorySchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      unique: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    parent: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
    is_deleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deleted_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "__v",
  },
);

function excludeSoftDeleted(next) {
  if (!this.getOptions().withDeleted) {
    this.where({ is_deleted: { $ne: true } });
  }
  next();
}
CategorySchema.pre("find", excludeSoftDeleted);
CategorySchema.pre("findOne", excludeSoftDeleted);
CategorySchema.pre("countDocuments", excludeSoftDeleted);

CategorySchema.methods.softDelete = function () {
  this.is_deleted = true;
  this.deleted_at = new Date();
  return this.save();
};

export default mongoose.model("Category", CategorySchema);
