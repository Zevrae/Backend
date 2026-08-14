import axios from "axios";
import FormData from "form-data";
import Tryon from "../models/Tryon.js";
import Product from "../models/Product.js";
import { extractFileIdFromUrl, getFileBuffer, BUCKET_ID } from "../utils/appwrite.js";
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
    const buffer = await getFileBuffer(BUCKET_ID, fileId);
    buffers.push({ buffer, filename: `${fileId}.jpg`, contentType: "image/jpeg" });
  }

  return buffers;
}

// @desc    Start a virtual try-on generation: sends the uploaded person
//          photo and one or more garment photos to the external try-on
//          microservice. Runs as a background job — this responds as soon
//          as the job is queued (typically <1s), NOT once generation
//          finishes (which routinely takes 25-40s). Poll
//          GET /api/tryon/:id/status for the result.
//
//          This is a deliberate design choice, not a shortcut: a
//          synchronous 30+ second HTTP request is fragile against ANY
//          proxy/load balancer/CDN timeout in the chain, and there's
//          usually more than one between a browser and this server in
//          production. No single timeout value is safe to hard-code
//          against every possible layer, so the fix is to not need one.
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

    // Create the job record and respond immediately — everything below
    // this point runs in the background, decoupled from this HTTP request.
    const record = await Tryon.create({
      user: req.user._id,
      product: product._id,
      clothImageUrls,
      status: "pending",
    });

    res.status(202).json({ success: true, data: record });

    runTryonJob(record._id, personFile, clothBuffers).catch((err) => {
      // runTryonJob already persists failures to the record; this catch
      // only exists so an unexpected throw can't become an unhandled
      // promise rejection and crash the process.
      console.error("[tryon] background job crashed unexpectedly:", err);
    });
  } catch (err) {
    next(err);
  }
};

// Does the actual slow work: calls the microservice and updates the Tryon
// record with the result. Never touches `req`/`res` — by the time this
// runs, the HTTP response has already been sent.
async function runTryonJob(tryonId, personFile, clothBuffers) {
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

  try {
    const response = await axios.post(
      `${process.env.TRYON_SERVICE_URL}/api/v1/tryon`,
      formData,
      { headers: formData.getHeaders(), timeout: Number(process.env.TRYON_SERVICE_TIMEOUT_MS) || 60000 },
    );

    const imageUrl = response.data?.image_url;
    if (!imageUrl) {
      await Tryon.findByIdAndUpdate(tryonId, {
        status: "failed",
        error: "Try-on service did not return an image",
      });
      return;
    }

    await Tryon.findByIdAndUpdate(tryonId, { status: "completed", imageUrl });
  } catch (err) {
    // Same logging as before — still the place to look in `docker logs`
    // for the real cause of a failure, just no longer tied to a live
    // request that a client might have already given up waiting on.
    // ECONNABORTED (with a "timeout of Xms exceeded" message) means the
    // connection was established fine and OUR OWN axios `timeout` fired —
    // i.e. the microservice really was just slow to respond.
    // ETIMEDOUT/ECONNREFUSED/ENOTFOUND with no response at all means the
    // connection to TRYON_SERVICE_URL never properly opened in the first
    // place — that's a network/DNS/firewall/proxy problem between this
    // server and the microservice, NOT a "Gemini is slow" problem, and no
    // amount of raising TRYON_SERVICE_TIMEOUT_MS will fix it.
    const isNetworkLevelFailure = !err.response && err.code !== "ECONNABORTED";
    console.error("[tryon] upstream request failed:", {
      code: err.code,
      message: err.message,
      status: err.response?.status,
      data: err.response?.data,
      diagnosis: isNetworkLevelFailure
        ? "NETWORK-LEVEL — never connected to TRYON_SERVICE_URL. Check DNS/firewall/proxy between this server and the microservice, not Gemini's speed."
        : err.code === "ECONNABORTED"
          ? "APPLICATION-LEVEL TIMEOUT — connection was fine, the microservice itself didn't respond in time."
          : "Upstream returned an explicit error response — see status/data above.",
    });
    const message = isNetworkLevelFailure
      ? "Could not reach the try-on service. This is a server configuration issue, not something retrying will fix."
      : err.response?.data?.message || err.response?.data?.detail || "The try-on service failed to process the images";
    await Tryon.findByIdAndUpdate(tryonId, { status: "failed", error: message });
  }
}

// @desc    Poll the status of a try-on job started via POST /api/tryon
// @route   GET /api/tryon/:id/status
export const getTryonStatus = async (req, res, next) => {
  try {
    const record = await Tryon.findOne({ _id: req.params.id, user: req.user._id });
    if (!record) {
      return res.status(404).json({ success: false, message: "Try-on job not found" });
    }
    res.json({ success: true, data: record });
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
