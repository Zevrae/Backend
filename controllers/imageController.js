import { extractFileIdFromUrl, extractBucketIdFromUrl, getFileBuffer, getFileMeta, isAppwriteFileUrl } from "../utils/appwrite.js";

// @desc    Proxy an Appwrite-hosted image through the backend.
//          Appwrite's CORS config only allows a small set of trusted
//          origins to call it directly, so any place the frontend needs
//          the raw bytes of an image it already has a URL for (e.g. to
//          convert it to a File, or to force-download it) has to go
//          through here instead of `fetch()`-ing Appwrite from the browser.
// @route   GET /api/images/proxy?url=<appwrite file view url>
export const proxyImage = async (req, res, next) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ success: false, message: "url query param is required" });
    }
    if (!isAppwriteFileUrl(url)) {
      return res
        .status(400)
        .json({ success: false, message: "Only files hosted on this app's Appwrite endpoint can be proxied" });
    }

    const fileId = extractFileIdFromUrl(url);
    // The bucket a file lives in comes from the URL itself — different
    // features (product images, review images, try-on results from the
    // separate try-on microservice) store files in different buckets, so
    // this must never be a single hardcoded bucket id.
    const bucketId = extractBucketIdFromUrl(url);
    if (!bucketId) {
      return res
        .status(400)
        .json({ success: false, message: "Could not determine the storage bucket for this file" });
    }

    const buffer = await getFileBuffer(bucketId, fileId);

    // Prefer the real mime type from Appwrite's file metadata — the URL
    // itself often has no file extension to guess from (Appwrite view URLs
    // look like /files/<id>/view, with no ".jpg"/".png" suffix), so a
    // best-effort extension guess silently falls back to
    // application/octet-stream far more often than it should.
    let contentType = "application/octet-stream";
    try {
      const meta = await getFileMeta(bucketId, fileId);
      if (meta?.mimeType) contentType = meta.mimeType;
    } catch {
      // Fall back to an extension guess if metadata lookup fails for any
      // reason — still better than nothing.
      const ext = (url.split("?")[0].split(".").pop() || "").toLowerCase();
      contentType =
        { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" }[ext] ||
        contentType;
    }

    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(buffer);
  } catch (err) {
    next(err);
  }
};
