import express from "express";
import { generateCustomProduct } from "../controllers/customProductController.js";
import { protect } from "../middleware/auth.js";
import { uploadDesignImages } from "../middleware/upload.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: CustomProducts
 *   description: Generate a purchasable Product from a finished "Customize" design
 */

/**
 * @swagger
 * /custom-products:
 *   post:
 *     summary: Generate a real Product from a finished design (logged-in users only)
 *     description: >
 *       Atomically claims stock from the matching CustomizableGarment color/size,
 *       uploads the composited front/back design images, and creates a real
 *       Product (visible in the catalog, orderable through the normal cart/order flow).
 *     tags: [CustomProducts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [front, cloth_type, color_id, size, quantity]
 *             properties:
 *               front: { type: string, format: binary }
 *               back: { type: string, format: binary }
 *               cloth_type: { type: string }
 *               color_id: { type: string }
 *               size: { type: string }
 *               quantity: { type: integer }
 *     responses:
 *       201:
 *         description: Product created
 *       409:
 *         description: Not enough stock for the requested color/size
 */
router.post("/", protect, uploadDesignImages, generateCustomProduct);

export default router;
