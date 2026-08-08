import mongoose from 'mongoose';
const { Schema } = mongoose;

// Captures "I wanted to buy this but it was out of stock" — a stronger,
// more direct demand signal than order counts for inventory/restocking
// decisions, since it also captures interest in items nobody could
// actually complete a purchase for. Doubles as the subscriber list for
// notifying people once the item (or specific size) is back in stock.
const StockNotificationSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    // Which size they wanted, if the product uses standard sizing.
    // Omitted/empty for 'nosize' products or a general "notify me" signup
    // not tied to one specific size.
    size: {
      type: String,
      default: '',
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
    },
    // Set if the requester was logged in — lets us link the signup to an
    // account without requiring one.
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    notified: {
      type: Boolean,
      default: false,
    },
    notified_at: {
      type: Date,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
  }
);

// One signup per email/product/size combination — resubmitting the same
// request shouldn't create duplicates or double-count the demand signal.
StockNotificationSchema.index({ product: 1, size: 1, email: 1 }, { unique: true });

export default mongoose.model('StockNotification', StockNotificationSchema);
