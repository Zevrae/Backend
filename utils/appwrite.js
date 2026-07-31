import { Client, Storage, ID, Permission, Role } from "node-appwrite";
import { InputFile } from "node-appwrite/file";

const client = new Client();

// Configuration check
const isConfigured = Boolean(
  process.env.APPWRITE_ENDPOINT &&
    process.env.APPWRITE_PROJECT_ID &&
    process.env.APPWRITE_API_KEY &&
    process.env.APPWRITE_BUCKET_ID
);

if (isConfigured) {
  client
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
}

const storage = new Storage(client);
const BUCKET_ID = process.env.APPWRITE_BUCKET_ID;
export const REVIEW_BUCKET_ID = process.env.APPWRITE_REVIEW_BUCKET_ID;

export const isAppwriteConfigured = () => isConfigured;

// ---------- Helpers ----------
const buildFileViewUrl = (bucketId, fileId) =>
  `${process.env.APPWRITE_ENDPOINT}/storage/buckets/${bucketId}/files/${fileId}/view?project=${process.env.APPWRITE_PROJECT_ID}`;

export const extractFileIdFromUrl = (url) => {
  if (typeof url !== "string") return null;
  const match = url.match(/\/files\/([^/]+)\/(?:view|download|preview)/);
  return match ? match[1] : null;
};

export const isAppwriteFileUrl = (url) => {
  if (typeof url !== "string" || !process.env.APPWRITE_ENDPOINT) return false;
  return url.startsWith(process.env.APPWRITE_ENDPOINT) && extractFileIdFromUrl(url) !== null;
};

// ---------- Product Images ----------
export const buildProductFileViewUrl = (fileId) => buildFileViewUrl(BUCKET_ID, fileId);

export const uploadFileToAppwrite = async (buffer, filename) => {
  if (!isConfigured) {
    throw new Error(
      "Appwrite is not configured: set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_BUCKET_ID"
    );
  }

  const file = InputFile.fromBuffer(buffer, filename);
  const created = await storage.createFile({
    bucketId: BUCKET_ID,
    fileId: ID.unique(),
    file,
    permissions: [Permission.read(Role.any())],
  });

  return buildProductFileViewUrl(created.$id);
};

export const deleteFileFromAppwrite = async (fileId) => {
  if (!isConfigured) return;
  await storage.deleteFile({ bucketId: BUCKET_ID, fileId });
};

export const getFileBuffer = async (fileId) => {
  if (!isConfigured) {
    throw new Error(
      "Appwrite is not configured: set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_BUCKET_ID"
    );
  }

  const result = await storage.getFileDownload({ bucketId: BUCKET_ID, fileId });
  return Buffer.isBuffer(result) ? result : Buffer.from(result);
};

// ---------- Review Images (CRUD) ----------
export const buildReviewFileViewUrl = (fileId) => buildFileViewUrl(REVIEW_BUCKET_ID, fileId);

export const uploadReviewFileToAppwrite = async (buffer, filename) => {
  if (!isConfigured || !REVIEW_BUCKET_ID) {
    throw new Error(
      "Appwrite is not configured: set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_REVIEW_BUCKET_ID"
    );
  }

  const file = InputFile.fromBuffer(buffer, filename);
  const created = await storage.createFile({
    bucketId: REVIEW_BUCKET_ID,
    fileId: ID.unique(),
    file,
    permissions: [Permission.read(Role.any())],
  });

  return buildReviewFileViewUrl(created.$id);
};

export const getReviewFileMeta = async (fileId) => {
  if (!isConfigured || !REVIEW_BUCKET_ID) {
    throw new Error("Appwrite not configured for review bucket");
  }
  return storage.getFile({ bucketId: REVIEW_BUCKET_ID, fileId });
};

export const updateReviewFile = async (fileId, buffer, filename) => {
  if (!isConfigured || !REVIEW_BUCKET_ID) {
    throw new Error("Appwrite not configured for review bucket");
  }

  // Delete old file
  await storage.deleteFile({ bucketId: REVIEW_BUCKET_ID, fileId });

  // Upload new file
  const file = InputFile.fromBuffer(buffer, filename);
  const created = await storage.createFile({
    bucketId: REVIEW_BUCKET_ID,
    fileId: ID.unique(),
    file,
    permissions: [Permission.read(Role.any())],
  });

  return buildReviewFileViewUrl(created.$id);
};

export const deleteReviewFile = async (fileId) => {
  if (!isConfigured || !REVIEW_BUCKET_ID) return;
  await storage.deleteFile({ bucketId: REVIEW_BUCKET_ID, fileId });
};
