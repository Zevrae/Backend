import express from "express";
import { processTryon, getMyTryons } from "../controllers/tryonController.js";
import { protect } from "../middleware/auth.js";
import { uploadTryonImages } from "../middleware/upload.js";

const router = express.Router();

// Every try-on route is private — results are tied to req.user, never a
// client-supplied id.
router.use(protect);

/**
 * tags:
 *   name: TryOn
 *   description: Virtual try-on — overlay a product's garment onto a photo of the user
 */

/**
 * /tryon:
 *   get:
 *     summary: List the current user's virtual try-on history
 *     tags: [TryOn]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Paginated list of the user's saved try-on results
 *   post:
 *     summary: Generate a virtual try-on image
 *     description: >
 *       Uploads a photo of the user and a product's garment photo
 *       (multipart/form-data) to the external try-on microservice
 *       (TRYON_SERVICE_URL) and saves the resulting image URL against the
 *       current user and the given product.
 *     tags: [TryOn]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [productId, person_image, cloth_image]
 *             properties:
 *               productId: { type: string }
 *               person_image: { type: string, format: binary }
 *               cloth_image: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Try-on generated and saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Tryon' }
 *       400:
 *         description: Missing productId or image files
 *       404:
 *         description: Product not found
 *       502:
 *         description: The try-on microservice failed to process the images
 *       503:
 *         description: Virtual try-on is not configured on the server (missing TRYON_SERVICE_URL)
 */
router.route("/").get(getMyTryons).post(uploadTryonImages, processTryon);

export default router;
