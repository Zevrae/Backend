import multer from 'multer';

const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only JPEG, PNG, WEBP, or GIF images are allowed'));
  }
};

// Accepts up to 5 files under the "images" form field, 5MB each, kept in
// memory so they can be streamed straight to Appwrite without touching disk.
export const uploadImages = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter,
}).array('images', 5);

// Accepts exactly one "person_image" and one "cloth_image" file, 5MB each,
// kept in memory so they can be streamed straight to the try-on microservice
// without ever touching local disk (important in PM2 cluster mode, where
// disk-based temp files aren't shared/cleaned up across worker processes).
export const uploadTryonImages = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
  fileFilter,
}).fields([
  { name: 'person_image', maxCount: 1 },
  { name: 'cloth_image', maxCount: 1 },
]);
