import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { generateRawToken, hashToken } from '../utils/tokens.js';
const { Schema } = mongoose;

const AddressSchema = new Schema(
  {
    label: { type: String, trim: true, default: 'Home' },
    line1: { type: String, required: true, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, trim: true },
    postal_code: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    is_default: { type: Boolean, default: false },
  },
  { _id: true }
);

const UserSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
      index: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: ['customer', 'admin'],
      default: 'customer',
      index: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    addresses: {
      type: [AddressSchema],
      default: [],
    },
    is_active: {
      type: Boolean,
      default: true,
    },

    // --- Email verification ---
    is_email_verified: {
      type: Boolean,
      default: false,
      index: true,
    },
    email_verification_token: {
      type: String,
      select: false,
    },
    email_verification_expires: {
      type: Date,
      select: false,
    },

    // --- Soft delete support ---
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

// Hash password before saving
UserSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Exclude soft-deleted users from default queries
function excludeSoftDeleted(next) {
  if (!this.getOptions().withDeleted) {
    this.where({ is_deleted: { $ne: true } });
  }
  next();
}
UserSchema.pre('find', excludeSoftDeleted);
UserSchema.pre('findOne', excludeSoftDeleted);
UserSchema.pre('countDocuments', excludeSoftDeleted);

UserSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Generates a fresh raw verification token, stores its hash + expiry on the
// user, and returns the RAW token (this is what gets emailed — never store
// the raw value in the DB).
UserSchema.methods.generateEmailVerificationToken = function () {
  const rawToken = generateRawToken();
  const hours = Number(process.env.EMAIL_VERIFICATION_EXPIRES_HOURS) || 24;

  this.email_verification_token = hashToken(rawToken);
  this.email_verification_expires = new Date(Date.now() + hours * 60 * 60 * 1000);

  return rawToken;
};

UserSchema.methods.softDelete = function () {
  this.is_deleted = true;
  this.deleted_at = new Date();
  this.is_active = false;
  return this.save();
};

UserSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.email_verification_token;
  delete obj.email_verification_expires;
  return obj;
};

export default mongoose.model('User', UserSchema);
