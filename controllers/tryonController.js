import axios from "axios";
import FormData from "form-data";
import Tryon from "../models/Tryon.js";
import Product from "../models/Product.js";
import { extractFileIdFromUrl, getFileBuffer } from "../utils/appwrite.js";
import { MAX_TRYON_CLOTH_IMAGES } from "../middleware/upload.js";

// A garment photo for a try-on request can come from either:
//   - an uploaded file (the "cloth_images" multipart field), or
//   - a URL already sitting on the product (product.images) — since that
//     file already lives in Appwrite, the frontend just needs to tell us
//     which one it picked instead of having the browser fetch() the bytes
//     itself. Appwrite's CORS policy only allows a handful of trusted
//     origins to call it directly, so any such fetch from the browser can
//     be blocked; fetching it server-side via the Appwrite SDK never hits
//     that restriction, since CORS is a browser-only concept.
async function resolveClothBuffers(clothFiles, clothImageUrls, product) {
  const buffers = [];

  for (const file of clothFiles || []) {
    buffers.push({ buffer: file.buffer, filename: file.originalname, contentType: file.mimetype });
  }

  for (const url of clothImageUrls || []) {
    if (!product.images.includes(url)) {
      throw new Error("One or more selected cloth images do not belong to this product");
    }
    const fileId = extractFileIdFromUrl(url);
    if (!fileId) {
      throw new Error("Could not resolve a cloth image URL to an Appwrite file");
    }
    const buffer = await getFileBuffer(fileId);
    buffers.push({ buffer, filename: `${fileId}.jpg`, contentType: "image/jpeg" });
  }

  return buffers;
}

// @desc    Generate a virtual try-on image: sends the uploaded person photo
//          and one or more garment photos to the external try-on
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
    if (!personFile) {
      return res.status(400).json({ success: false, message: "person_image file is required" });
    }

    // clothImageUrls arrives as a JSON-stringified array in the multipart
    // body (e.g. '["https://.../view?..."]') alongside any directly
    // uploaded cloth_images files — either or both may be present.
    let clothImageUrls = [];
    if (req.body.clothImageUrls) {
      try {
        const parsed = JSON.parse(req.body.clothImageUrls);
        if (Array.isArray(parsed)) clothImageUrls = parsed.filter((u) => typeof u === "string");
      } catch {
        return res.status(400).json({ success: false, message: "clothImageUrls must be a JSON array of strings" });
      }
    }
    const clothFiles = req.files?.cloth_images || [];

    if (clothFiles.length === 0 && clothImageUrls.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one cloth image is required (cloth_images files and/or clothImageUrls)",
      });
    }
    if (clothFiles.length + clothImageUrls.length > MAX_TRYON_CLOTH_IMAGES) {
      return res.status(400).json({
        success: false,
        message: `A maximum of ${MAX_TRYON_CLOTH_IMAGES} cloth images are supported per request`,
      });
    }

    const product = await Product.findById(productId).lean();
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    let clothBuffers;
    try {
      clothBuffers = await resolveClothBuffers(clothFiles, clothImageUrls, product);
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    // Files are held in memory (see middleware/upload.js uploadTryonImages),
    // so stream the buffers directly to the microservice — no temp files on
    // disk to create, race on, or clean up.
    const formData = new FormData();
    formData.append("person_image", personFile.buffer, {
      filename: personFile.originalname,
      contentType: personFile.mimetype,
    });
    for (const cloth of clothBuffers) {
      formData.append("cloth_images", cloth.buffer, {
        filename: cloth.filename,
        contentType: cloth.contentType,
      });
    }

    let response;
    try {
      response = await axios.post(
        `${process.env.TRYON_SERVICE_URL}/api/v1/tryon`,
        formData,
        { headers: formData.getHeaders(), timeout: 45000 },
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
      clothImageUrls,
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
