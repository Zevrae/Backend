import axios from "axios";
import FormData from "form-data";
import Tryon from "../models/Tryon.js";
import Product from "../models/Product.js";

// @desc    Generate a virtual try-on image: sends the uploaded person photo
//          and a product's garment photo to the external try-on
//          microservice, then saves the resulting image URL.
// @route   POST /api/tryon
export const processTryon = async (req, res, next) => {
  try {
    if (!process.env.TRYON_SERVICE_URL) {
      return res.status(503).json({
        success: false,
        message: "Virtual try-on is not configured on the server (missing TRYON_SERVICE_URL)",
      });
    }

    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }

    const personFile = req.files?.person_image?.[0];
    const clothFile = req.files?.cloth_image?.[0];
    if (!personFile || !clothFile) {
      return res
        .status(400)
        .json({ success: false, message: "Both person_image and cloth_image files are required" });
    }

    const product = await Product.findById(productId).lean();
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Files are held in memory (see middleware/upload.js uploadTryonImages),
    // so stream the buffers directly to the microservice — no temp files on
    // disk to create, race on, or clean up.
    const formData = new FormData();
    formData.append("person_image", personFile.buffer, {
      filename: personFile.originalname,
      contentType: personFile.mimetype,
    });
    formData.append("cloth_image", clothFile.buffer, {
      filename: clothFile.originalname,
      contentType: clothFile.mimetype,
    });

    let response;
    try {
      response = await axios.post(
        `${process.env.TRYON_SERVICE_URL}/api/v1/tryon`,
        formData,
        { headers: formData.getHeaders(), timeout: 30000 },
      );
    } catch (err) {
      // Distinguish "the external service errored/timed out" (502) from our
      // own bugs (which fall through to the generic error handler below).
      return res.status(502).json({
        success: false,
        message: err.response?.data?.message || "The try-on service failed to process the images",
      });
    }

    const imageUrl = response.data?.image_url;
    if (!imageUrl) {
      return res
        .status(502)
        .json({ success: false, message: "Try-on service did not return an image" });
    }

    // req.user is always set here (route is behind `protect`) — never trust
    // a client-supplied userId for whose history a record belongs to.
    const record = await Tryon.create({
      user: req.user._id,
      product: product._id,
      imageUrl,
    });

    res.status(201).json({ success: true, data: record });
  } catch (err) {
    next(err);
  }
};

// @desc    List the current user's virtual try-on history
// @route   GET /api/tryon
export const getMyTryons = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Tryon.find({ user: req.user._id })
        .populate("product", "name images")
        .sort("-created_at")
        .skip(skip)
        .limit(limit)
        .lean(),
      Tryon.countDocuments({ user: req.user._id }),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};
