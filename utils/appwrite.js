import { Client, Storage, ID, Permission, Role } from "node-appwrite";
import { InputFile } from "node-appwrite/file";

const client = new Client();

// Configuration check
const isConfigured = Boolean(
  process.env.APPWRITE_ENDPOINT &&
  process.env.APPWRITE_PROJECT_ID &&
  process.env.APPWRITE_API_KEY &&
  process.env.APPWRITE_BUCKET_ID,
);

if (isConfigured) {
  client
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
}

const storage = new Storage(client);
const BUCKET_ID = process.env.APPWRITE_BUCKET_ID;
export { BUCKET_ID };
export const REVIEW_BUCKET_ID = process.env.APPWRITE_REVIEW_BUCKET_ID;

export const isAppwriteConfigured = () => isConfigured;

// None of the calls below previously had any timeout — if Appwrite's API
// is unreachable or slow (e.g. restricted outbound network egress from the
// production host, which fits observed symptoms: every Appwrite-touching
// endpoint fails, everything that never leaves the server works fine),
// they'd hang indefinitely with no way to fail cleanly. That kind of hang
// is what eventually gets killed uncleanly by an upstream proxy/timeout —
// producing a connection reset/no-response that the browser can't
// distinguish from "blocked by CORS" (there's no response to attach CORS
// headers to at all). Wrapping every call means a genuine connectivity
// problem fails fast with a specific, loggable error instead.
const APPWRITE_TIMEOUT_MS = Number(process.env.APPWRITE_TIMEOUT_MS) || 20000;

const withTimeout = async (promise, label) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `Appwrite ${label} timed out after ${APPWRITE_TIMEOUT_MS}ms — check the production server's outbound network access to APPWRITE_ENDPOINT (${process.env.APPWRITE_ENDPOINT}).`,
              ),
            ),
          APPWRITE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

// ---------- Helpers ----------
// ✅ FIXED — internal path only, no Appwrite details exposed
export const buildProductFileViewUrl = (fileId) =>
  `/api/images/product/${fileId}`;
export const buildReviewFileViewUrl = (fileId) =>
  `/api/images/review/${fileId}`;

export const extractFileIdFromUrl = (url) => {
  if (typeof url !== "string") return null;
  // New internal format: /api/images/product/<fileId> or /api/images/review/<fileId>
  const internalMatch = url.match(
    /\/api\/images\/(?:product|review)\/([^/?]+)/,
  );
  if (internalMatch) return internalMatch[1];
  // Legacy raw Appwrite URL format, for images stored before this fix
  const legacyMatch = url.match(/\/files\/([^/]+)\/(?:view|download|preview)/);
  return legacyMatch ? legacyMatch[1] : null;
};

export const extractBucketIdFromUrl = (url) => {
  if (typeof url !== "string") return null;
  const match = url.match(/\/buckets\/([^/]+)\/files\//);
  return match ? match[1] : null;
};

// A file view URL is /storage/buckets/{bucketId}/files/{fileId}/view — the
// bucket a file lives in is NOT always the product-images bucket (e.g.
// try-on result images, uploaded by the separate try-on microservice, live
// in their own bucket). Every place that fetches file bytes by URL must use
// THIS bucket id, not an assumed/hardcoded one, or the lookup 404s against
// the wrong bucket.
export const extractBucketIdFromUrl = (url) => {
  if (typeof url !== "string") return null;
  const match = url.match(/\/buckets\/([^/]+)\/files\//);
  return match ? match[1] : null;
};

export const isAppwriteFileUrl = (url) => {
  if (typeof url !== "string" || !process.env.APPWRITE_ENDPOINT) return false;
  return (
    url.startsWith(process.env.APPWRITE_ENDPOINT) &&
    extractFileIdFromUrl(url) !== null
  );
};

// ---------- Product Images ----------

export const uploadFileToAppwrite = async (buffer, filename) => {
  if (!isConfigured) {
    throw new Error(
      "Appwrite is not configured: set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_BUCKET_ID",
    );
  }

  const file = InputFile.fromBuffer(buffer, filename);
  const created = await withTimeout(
    storage.createFile({
      bucketId: BUCKET_ID,
      fileId: ID.unique(),
      file,
      permissions: [Permission.read(Role.any())],
    }),
    "createFile (product image)",
  );

  return buildProductFileViewUrl(created.$id);
};

export const deleteFileFromAppwrite = async (fileId) => {
  if (!isConfigured) return;
  await withTimeout(
    storage.deleteFile({ bucketId: BUCKET_ID, fileId }),
    "deleteFile (product image)",
  );
};

export const getFileBuffer = async (bucketId, fileId) => {
  if (!isConfigured) {
    throw new Error(
      "Appwrite is not configured: set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_BUCKET_ID",
    );
  }

  const result = await withTimeout(
    storage.getFileDownload({ bucketId, fileId }),
    "getFileDownload",
  );
  return Buffer.isBuffer(result) ? result : Buffer.from(result);
};

// File metadata (includes the real mimeType) — used by the image proxy so
// downloaded/served files get an accurate Content-Type instead of a guess
// based on the URL's (often absent) file extension.
export const getFileMeta = async (bucketId, fileId) => {
  if (!isConfigured) {
    throw new Error(
      "Appwrite is not configured: set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_BUCKET_ID",
    );
  }
  return withTimeout(storage.getFile({ bucketId, fileId }), "getFile (meta)");
};

// ---------- Review Images (CRUD) ----------

export const uploadReviewFileToAppwrite = async (buffer, filename) => {
  if (!isConfigured || !REVIEW_BUCKET_ID) {
    throw new Error(
      "Appwrite is not configured: set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_REVIEW_BUCKET_ID",
    );
  }

  const file = InputFile.fromBuffer(buffer, filename);
  const created = await withTimeout(
    storage.createFile({
      bucketId: REVIEW_BUCKET_ID,
      fileId: ID.unique(),
      file,
      permissions: [Permission.read(Role.any())],
    }),
    "createFile (review image)",
  );

  return buildReviewFileViewUrl(created.$id);
};

export const getReviewFileMeta = async (fileId) => {
  if (!isConfigured || !REVIEW_BUCKET_ID) {
    throw new Error("Appwrite not configured for review bucket");
  }
  return withTimeout(
    storage.getFile({ bucketId: REVIEW_BUCKET_ID, fileId }),
    "getFile (review image)",
  );
};

export const updateReviewFile = async (fileId, buffer, filename) => {
  if (!isConfigured || !REVIEW_BUCKET_ID) {
    throw new Error("Appwrite not configured for review bucket");
  }

  // Delete old file
  await withTimeout(
    storage.deleteFile({ bucketId: REVIEW_BUCKET_ID, fileId }),
    "deleteFile (review image, old)",
  );

  // Upload new file
  const file = InputFile.fromBuffer(buffer, filename);
  const created = await withTimeout(
    storage.createFile({
      bucketId: REVIEW_BUCKET_ID,
      fileId: ID.unique(),
      file,
      permissions: [Permission.read(Role.any())],
    }),
    "createFile (review image, replacement)",
  );

  return buildReviewFileViewUrl(created.$id);
};

export const deleteReviewFile = async (fileId) => {
  if (!isConfigured || !REVIEW_BUCKET_ID) return;
  await withTimeout(
    storage.deleteFile({ bucketId: REVIEW_BUCKET_ID, fileId }),
    "deleteFile (review image)",
  );
};
