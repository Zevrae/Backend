import { Client, Storage, ID, Permission, Role } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';

const client = new Client();

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

export const isAppwriteConfigured = () => isConfigured;

// Builds the public "view" URL for a file — this is a plain REST endpoint,
// so it doesn't require an extra API call (unlike the server SDK's
// getFileView, which downloads the file bytes rather than returning a URL).
export const buildFileViewUrl = (fileId) =>
  `${process.env.APPWRITE_ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${fileId}/view?project=${process.env.APPWRITE_PROJECT_ID}`;

// Pulls the Appwrite file id back out of a view/download/preview URL, so we
// can delete the underlying file when an image is removed from a product.
export const extractFileIdFromUrl = (url) => {
  const match = typeof url === 'string' && url.match(/\/files\/([^/]+)\/(view|download|preview)/);
  return match ? match[1] : null;
};

// Uploads a buffer (e.g. from a multer memory upload) to Appwrite Storage
// and returns the public view URL to save on the Product document.
export const uploadFileToAppwrite = async (buffer, filename) => {
  if (!isConfigured) {
    throw new Error(
      'Appwrite is not configured: set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_BUCKET_ID'
    );
  }

  const file = InputFile.fromBuffer(buffer, filename);
  const created = await storage.createFile({
    bucketId: BUCKET_ID,
    fileId: ID.unique(),
    file,
    // Public read so product images can be displayed without an Appwrite session
    permissions: [Permission.read(Role.any())],
  });

  return buildFileViewUrl(created.$id);
};

export const deleteFileFromAppwrite = async (fileId) => {
  if (!isConfigured) return;
  await storage.deleteFile({ bucketId: BUCKET_ID, fileId });
};
