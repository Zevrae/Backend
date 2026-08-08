import StockNotification from "../models/StockNotification.js";
import Analysis from "../models/Analysis.js";
import Product from "../models/Product.js";

// @desc    Sign up to be notified when a product (or a specific size of it)
//          is back in stock. Also increments that product's notifyCounter
//          in the Analysis collection — this is the actual link to the
//          demand-tracking data the admin Analysis dashboard reads from.
// @route   POST /api/products/:id/notify
export const subscribeToStockNotification = async (req, res, next) => {
  try {
    const { id: productId } = req.params;
    const size = (req.body.size || "").trim();
    // Logged-in users don't need to type their email — guests do.
    const email = (req.user?.email || req.body.email || "").trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: "Enter a valid email address" });
    }

    const product = await Product.findOne({ _id: productId, is_deleted: { $ne: true } }).lean();
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Not a hard block — someone might legitimately want a heads-up for a
    // size that just sold out between page load and clicking the button —
    // but genuinely in-stock items shouldn't be signable, since a flood of
    // signups on things that never needed them would dilute the whole
    // point of this signal for the inventory team.
    const sizeStock = product.size_stock instanceof Map ? Object.fromEntries(product.size_stock) : product.size_stock || {};
    const relevantStock = size ? sizeStock[size] : Object.values(sizeStock).reduce((sum, q) => sum + (q || 0), 0);
    if ((relevantStock || 0) > 0) {
      return res.status(400).json({
        success: false,
        message: size ? `Size ${size} is currently in stock.` : "This product is currently in stock.",
      });
    }

    let created = true;
    try {
      await StockNotification.create({
        product: productId,
        size,
        email,
        user: req.user?._id,
      });
    } catch (err) {
      if (err.code === 11000) {
        // Already signed up for this exact product/size/email — not an
        // error from the requester's point of view, just a no-op. We
        // still don't double-count the demand signal below.
        created = false;
      } else {
        throw err;
      }
    }

    if (created) {
      await Analysis.findOneAndUpdate(
        { productId },
        { $inc: { notifyCounter: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    }

    res.status(created ? 201 : 200).json({
      success: true,
      message: created
        ? "You'll be notified when this is back in stock."
        : "You're already signed up to be notified about this.",
    });
  } catch (err) {
    next(err);
  }
};

// @desc    List pending (not yet notified) signups for a product — lets an
//          admin see exactly who to reach out to after restocking.
// @route   GET /api/products/:id/notify (admin only)
export const getStockNotifications = async (req, res, next) => {
  try {
    const notifications = await StockNotification.find({ product: req.params.id, notified: false })
      .sort("-created_at")
      .lean();
    res.json({ success: true, data: notifications });
  } catch (err) {
    next(err);
  }
};
