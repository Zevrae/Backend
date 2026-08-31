import express from "express";
import {
  getCustomizableGarments,
  getCustomizableGarmentById,
  createCustomizableGarment,
  updateCustomizableGarment,
  deleteCustomizableGarment,
  addColorVariant,
  updateColorVariant,
  deleteColorVariant,
  uploadColorImages,
} from "../controllers/customizableGarmentController.js";
import { protect, authorize, optionalAuth } from "../middleware/auth.js";
import { uploadGarmentColorImages } from "../middleware/upload.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: CustomizableGarments
 *   description: Blank garment stock (cloth type → color → size) used by the "Customize" product flow
 */

router
  .route("/")
  .get(optionalAuth, getCustomizableGarments)
  .post(protect, authorize("admin"), createCustomizableGarment);

router
  .route("/:id")
  .get(getCustomizableGarmentById)
  .put(protect, authorize("admin"), updateCustomizableGarment)
  .delete(protect, authorize("admin"), deleteCustomizableGarment);

router.route("/:id/colors").post(protect, authorize("admin"), addColorVariant);

router
  .route("/:id/colors/:colorId")
  .put(protect, authorize("admin"), updateColorVariant)
  .delete(protect, authorize("admin"), deleteColorVariant);

router
  .route("/:id/colors/:colorId/images")
  .post(protect, authorize("admin"), uploadGarmentColorImages, uploadColorImages);

export default router;
