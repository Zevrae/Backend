import multer from "multer";

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const mimetype = file.mimetype.toLowerCase();
  console.log("Incoming file mimetype:", mimetype); // 🔍 Debug log

  // ✅ Check if the file is any type of image
  if (mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(
      new multer.MulterError(
        "LIMIT_UNEXPECTED_FILE",
        "Only image files are allowed",
      ),
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

// ✅ Customizable-garment color template photos (front/back, 15MB each)
export const uploadGarmentColorImages = multer({
  storage,
  limits: { fileSize: MAX_PRODUCT_IMAGE_SIZE_MB * 1024 * 1024, files: 2 },
  fileFilter,
}).fields([
  { name: "front", maxCount: 1 },
  { name: "back", maxCount: 1 },
]);

// ✅ Generated design composites from the "Customize" editor (front/back,
// 15MB each — these are full-stage PNG composites, not tiny thumbnails)
export const uploadDesignImages = multer({
  storage,
  limits: { fileSize: MAX_PRODUCT_IMAGE_SIZE_MB * 1024 * 1024, files: 2 },
  fileFilter,
}).fields([
  { name: "front", maxCount: 1 },
  { name: "back", maxCount: 1 },
]);

// ✅ Try-on uploads (1 person image + up to 5 cloth images, 5MB each)
export const MAX_TRYON_CLOTH_IMAGES = 5;

export const uploadTryonImages = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 1 + MAX_TRYON_CLOTH_IMAGES },
  fileFilter,
}).fields([
  { name: "person_image", maxCount: 1 },
  { name: "cloth_images", maxCount: MAX_TRYON_CLOTH_IMAGES },
]);
