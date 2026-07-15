import mongoose from 'mongoose';
const { Schema } = mongoose;

const CollectionSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Collection name is required'],
      trim: true,
      maxlength: [200, 'Name cannot exceed 200 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Slug is required'],
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    featured: {
      type: Boolean,
      default: false,
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
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: '__v',
  }
);

function excludeSoftDeleted(next) {
  if (!this.getOptions().withDeleted) {
    this.where({ is_deleted: { $ne: true } });
  }
  next();
}
CollectionSchema.pre('find', excludeSoftDeleted);
CollectionSchema.pre('findOne', excludeSoftDeleted);
CollectionSchema.pre('countDocuments', excludeSoftDeleted);

CollectionSchema.methods.softDelete = function () {
  this.is_deleted = true;
  this.deleted_at = new Date();
  return this.save();
};

export default mongoose.model('Collection', CollectionSchema);
