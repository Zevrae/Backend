import {
  extractFileIdFromUrl,
  extractBucketIdFromUrl,
  getFileBuffer,
  isAppwriteFileUrl,
  BUCKET_ID,
  REVIEW_BUCKET_ID,
} from "../utils/appwrite.js";

// @desc    Proxy an Appwrite-hosted image through the backend.
//          Appwrite's CORS config only allows a small set of trusted
//          origins to call it directly, so any place the frontend needs
//          the raw bytes of an image it already has a URL for (e.g. to
//          convert it to a File, or to force-download it) has to go
//          through here instead of `fetch()`-ing Appwrite from the browser.
// @route   GET /api/images/proxy?url=<appwrite file view url>

const streamImage = async (fileId, bucketId, res, next) => {
  try {
    const buffer = await getFileBuffer(fileId, bucketId);
    res.set("Content-Type", "application/octet-stream");
    res.set("Cache-Control", "public, max-age=86400");
    res.send(buffer);
  } catch (err) {
    next(err);
  }
};

// @route   GET /api/images/product/:fileId
export const getProductImage = (req, res, next) =>
  streamImage(req.params.fileId, BUCKET_ID, res, next);

// @route   GET /api/images/review/:fileId
export const getReviewImage = (req, res, next) =>
  streamImage(req.params.fileId, REVIEW_BUCKET_ID, res, next);

export const proxyImage = async (req, res, next) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res
        .status(400)
        .json({ success: false, message: "url query param is required" });
    }
    if (!isAppwriteFileUrl(url)) {
      return res.status(400).json({
        success: false,
        message:
          "Only files hosted on this app's Appwrite endpoint can be proxied",
      });
    }

    const fileId = extractFileIdFromUrl(url);
    const bucketId = extractBucketIdFromUrl(url);
    const buffer = await getFileBuffer(fileId, bucketId);

    // Best-effort content-type from the URL's extension; Appwrite's view
    // endpoint doesn't expose the mime type without a second metadata
    // call, and the browser only needs something sane to render/save it.
    const ext = (url.split("?")[0].split(".").pop() || "").toLowerCase();
    const contentType =
      {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        gif: "image/gif",
      }[ext] || "application/octet-stream";

    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(buffer);
  } catch (err) {
    next(err);
  }
};
