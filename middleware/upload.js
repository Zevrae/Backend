import multer from "multer";

const storage = multer.memoryStorage();

// ✅ Expanded MIME types to cover Safari/iOS/macOS quirks and legacy variants
const ALLOWED_MIME_TYPES = [
  "image/jpeg",   // standard JPEG
  "image/jpg",    // rare variant
  "image/pjpeg",  // progressive JPEG (Safari/older browsers)
  "image/png",    // standard PNG
  "image/x-png",  // legacy PNG (Safari/IE)
  "image/webp",   // WebP
  "image/gif",    // standard GIF
  "image/x-gif"   // legacy GIF
];

const fileFilter = (req, file, cb) => {
  const mimetype = file.mimetype.toLowerCase();
  console.log("Incoming file mimetype:", mimetype); // 🔍 Debug log
  if (ALLOWED_MIME_TYPES.includes(mimetype)) {
    cb(null, true);
  } else {
    cb(
      new multer.MulterError(
        "LIMIT_UNEXPECTED_FILE",
        "Only JPEG, PNG, WEBP, or GIF images are allowed"
      )
    );
  }
};

const MAX_PRODUCT_IMAGE_SIZE_MB = 15;

// ✅ Product image uploads (up to 5 files, 15MB each)
export const uploadImages = multer({
  storage,
  limits: { fileSize: MAX_PRODUCT_IMAGE_SIZE_MB * 1024 * 1024, files: 5 },
  fileFilter,
}).array("images", 5);

// ✅ Try-on uploads (1 person image + up to 5 cloth images, 5MB each)
export const MAX_TRYON_CLOTH_IMAGES = 5;

export const uploadTryonImages = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 + MAX_TRYON_CLOTH_IMAGES },
  fileFilter,
}).fields([
  { name: "person_image", maxCount: 1 },
  { name: "cloth_images", maxCount: MAX_TRYON_CLOTH_IMAGES },
]);
