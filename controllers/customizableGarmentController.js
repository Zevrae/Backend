import CustomizableGarment from "../models/CustomizableGarment.js";
import {
  uploadFileToAppwrite,
  isAppwriteConfigured,
} from "../utils/appwrite.js";

// @desc    List customizable garments (public — powers the /customize page)
// @route   GET /api/customizable-garments
export const getCustomizableGarments = async (req, res, next) => {
  try {
    const filter = {};
    // Only admins should see inactive cloth types / be able to opt into
    // seeing them; the storefront editor should only ever offer active ones.
    if (!(req.user && req.user.role === "admin")) {
      filter.status = "active";
    } else if (req.query.status) {
      filter.status = req.query.status;
    }

    const garments = await CustomizableGarment.find(filter).sort("cloth_type").lean();
    res.json({ success: true, data: garments });
  } catch (err) {
    next(err);
  }
};

// @desc    Get a single cloth type
// @route   GET /api/customizable-garments/:id
export const getCustomizableGarmentById = async (req, res, next) => {
  try {
    const garment = await CustomizableGarment.findById(req.params.id).lean();
    if (!garment) {
      return res.status(404).json({ success: false, message: "Cloth type not found" });
    }
    res.json({ success: true, data: garment });
  } catch (err) {
    next(err);
  }
};

// @desc    Create a new cloth type (admin only)
// @route   POST /api/customizable-garments
export const createCustomizableGarment = async (req, res, next) => {
  try {
    const garment = await CustomizableGarment.create(req.body);
    res.status(201).json({ success: true, data: garment });
  } catch (err) {
    next(err);
  }
};

// @desc    Update a cloth type's top-level fields (label, price, sizes,
//          print areas, status). Colors/stock are managed by the dedicated
//          endpoints below so concurrent stock edits don't clobber each
//          other via a full-document overwrite.
// @route   PUT /api/customizable-garments/:id
export const updateCustomizableGarment = async (req, res, next) => {
  try {
    const { colors, ...rest } = req.body; // colors managed separately
    const garment = await CustomizableGarment.findByIdAndUpdate(
      req.params.id,
      rest,
      { new: true, runValidators: true },
    );
    if (!garment) {
      return res.status(404).json({ success: false, message: "Cloth type not found" });
    }
    res.json({ success: true, data: garment });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete a cloth type (admin only)
// @route   DELETE /api/customizable-garments/:id
export const deleteCustomizableGarment = async (req, res, next) => {
  try {
    const garment = await CustomizableGarment.findByIdAndDelete(req.params.id);
    if (!garment) {
      return res.status(404).json({ success: false, message: "Cloth type not found" });
    }
    res.json({ success: true, message: "Cloth type deleted" });
  } catch (err) {
    next(err);
  }
};

// @desc    Add a color variant to a cloth type
// @route   POST /api/customizable-garments/:id/colors
export const addColorVariant = async (req, res, next) => {
  try {
    const { id: colorId, label, hex, size_stock } = req.body;
    if (!colorId || !label) {
      return res.status(400).json({ success: false, message: "Color id and label are required" });
    }

    const garment = await CustomizableGarment.findById(req.params.id);
    if (!garment) {
      return res.status(404).json({ success: false, message: "Cloth type not found" });
    }
    if (garment.colors.some((c) => c.id === colorId.trim().toLowerCase())) {
      return res.status(400).json({ success: false, message: "A color with this id already exists" });
    }

    garment.colors.push({
      id: colorId.trim().toLowerCase(),
      label,
      hex: hex || "#111111",
      size_stock: size_stock || {},
    });
    await garment.save();
    res.status(201).json({ success: true, data: garment });
  } catch (err) {
    next(err);
  }
};

// @desc    Update a color variant's label/hex/stock
// @route   PUT /api/customizable-garments/:id/colors/:colorId
export const updateColorVariant = async (req, res, next) => {
  try {
    const { label, hex, size_stock } = req.body;
    const garment = await CustomizableGarment.findById(req.params.id);
    if (!garment) {
      return res.status(404).json({ success: false, message: "Cloth type not found" });
    }
    const color = garment.colors.find((c) => c.id === req.params.colorId);
    if (!color) {
      return res.status(404).json({ success: false, message: "Color not found" });
    }

    if (label !== undefined) color.label = label;
    if (hex !== undefined) color.hex = hex;
    if (size_stock !== undefined) {
      color.size_stock = new Map(Object.entries(size_stock));
    }
    await garment.save();
    res.json({ success: true, data: garment });
  } catch (err) {
    next(err);
  }
};

// @desc    Remove a color variant
// @route   DELETE /api/customizable-garments/:id/colors/:colorId
export const deleteColorVariant = async (req, res, next) => {
  try {
    const garment = await CustomizableGarment.findById(req.params.id);
    if (!garment) {
      return res.status(404).json({ success: false, message: "Cloth type not found" });
    }
    const before = garment.colors.length;
    garment.colors = garment.colors.filter((c) => c.id !== req.params.colorId);
    if (garment.colors.length === before) {
      return res.status(404).json({ success: false, message: "Color not found" });
    }
    await garment.save();
    res.json({ success: true, data: garment });
  } catch (err) {
    next(err);
  }
};

// @desc    Upload the front/back template photos for a color variant
// @route   POST /api/customizable-garments/:id/colors/:colorId/images
//          multipart/form-data fields: "front", "back" (either or both)
export const uploadColorImages = async (req, res, next) => {
  try {
    if (!isAppwriteConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Image storage is not configured on the server (missing Appwrite env vars)",
      });
    }

    const garment = await CustomizableGarment.findById(req.params.id);
    if (!garment) {
      return res.status(404).json({ success: false, message: "Cloth type not found" });
    }
    const color = garment.colors.find((c) => c.id === req.params.colorId);
    if (!color) {
      return res.status(404).json({ success: false, message: "Color not found" });
    }

    const files = req.files || {};
    if (!files.front && !files.back) {
      return res.status(400).json({
        success: false,
        message: 'No image files provided (use the "front" and/or "back" fields)',
      });
    }

    if (files.front?.[0]) {
      color.images.front = await uploadFileToAppwrite(
        files.front[0].buffer,
        files.front[0].originalname,
      );
    }
    if (files.back?.[0]) {
      color.images.back = await uploadFileToAppwrite(
        files.back[0].buffer,
        files.back[0].originalname,
      );
    }

    await garment.save();
    res.status(201).json({ success: true, data: garment });
  } catch (err) {
    next(err);
  }
};
