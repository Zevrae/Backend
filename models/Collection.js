import {Schema, model} from 'mongoose';

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
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    featured: {
      type: Boolean,
      default: false,
    },
  },
  {timestamps: true}
);

export default model('Collection', CollectionSchema);