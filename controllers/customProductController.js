import CustomizableGarment from "../models/CustomizableGarment.js";
import Product from "../models/Product.js";
import {
  uploadFileToAppwrite,
  isAppwriteConfigured,
} from "../utils/appwrite.js";

// @desc    Turn a finished design (front/back composite PNGs) into a real,
//          purchasable Product — and atomically claim the matching stock
//          from the blank-garment inventory it was built on.
// @route   POST /api/custom-products
//          multipart/form-data: front (file, required), back (file,
//          optional), cloth_type, color_id, size, quantity
export const generateCustomProduct = async (req, res, next) => {
  try {
    if (!isAppwriteConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Image storage is not configured on the server (missing Appwrite env vars)",
      });
    }

    const { cloth_type, color_id, size, quantity } = req.body;
    const qty = parseInt(quantity, 10);

    if (!cloth_type || !color_id || !size) {
      return res.status(400).json({
        success: false,
        message: "cloth_type, color_id and size are required",
      });
    }
    if (!Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ success: false, message: "quantity must be a positive integer" });
    }
    if (!req.files?.front?.[0]) {
      return res.status(400).json({ success: false, message: 'A "front" design image is required' });
    }

    const garment = await CustomizableGarment.findOne({
      cloth_type: cloth_type.trim().toLowerCase(),
      status: "active",
    });
    if (!garment) {
      return res.status(404).json({ success: false, message: "Cloth type not found or unavailable" });
    }
    const color = garment.colors.find((c) => c.id === color_id.trim().toLowerCase());
    if (!color) {
      return res.status(404).json({ success: false, message: "Color not found for this cloth type" });
    }
    if (!garment.sizes.includes(size)) {
      return res.status(400).json({ success: false, message: `Invalid size for ${garment.label}` });
    }

    // Atomically claim stock: only decrements if enough is currently
    // available, using the exact same $gte-guarded $inc pattern as the
    // rest of the codebase would for a race-safe stock check-and-claim in
    // one round trip — two customers racing for the last unit can't both
    // succeed.
    const stockPath = `colors.$[c].size_stock.${size}`;
    const claimed = await CustomizableGarment.findOneAndUpdate(
      {
        _id: garment._id,
        colors: { $elemMatch: { id: color.id, [`size_stock.${size}`]: { $gte: qty } } },
      },
      { $inc: { [stockPath]: -qty } },
      { arrayFilters: [{ "c.id": color.id }], new: true },
    );
    if (!claimed) {
      return res.status(409).json({
        success: false,
        message: `Not enough stock for ${garment.label} — ${color.label} (${size}). Only ${
          color.size_stock.get(size) ?? 0
        } available.`,
      });
    }

    // Upload the generated composites. If this fails after stock was
    // already claimed, refund it so the garment doesn't silently leak
    // inventory.
    let frontUrl, backUrl;
    try {
      frontUrl = await uploadFileToAppwrite(
        req.files.front[0].buffer,
        `custom-${cloth_type}-${color_id}-${Date.now()}-front.png`,
      );
      if (req.files.back?.[0]) {
        backUrl = await uploadFileToAppwrite(
          req.files.back[0].buffer,
          `custom-${cloth_type}-${color_id}-${Date.now()}-back.png`,
        );
      }
    } catch (uploadErr) {
      await CustomizableGarment.updateOne(
        { _id: garment._id },
        { $inc: { [stockPath]: qty } },
        { arrayFilters: [{ "c.id": color.id }] },
      );
      throw uploadErr;
    }

    const images = [frontUrl, ...(backUrl ? [backUrl] : [])];

    const product = await Product.create({
      name: `Custom ${garment.label} — ${color.label} (${size})`,
      description:
        `A one-of-one ${garment.label.toLowerCase()} designed by you in ${color.label.toLowerCase()}, ` +
        `size ${size}. Made to order — this exact design is only available in the quantity you generated.`,
      category: "Customized",
      subcategory: garment.label,
      price: garment.price,
      images,
      inventory_mode: "size",
      sizes: [size],
      size_stock: { [size]: qty },
      status: "active",
      is_customized: true,
      customization: {
        garment: garment._id,
        cloth_type: garment.cloth_type,
        cloth_label: garment.label,
        color_id: color.id,
        color_label: color.label,
        size,
      },
    });

    res.status(201).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};
