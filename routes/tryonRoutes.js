import express from "express";
import { processTryon, getMyTryons, getTryonStatus } from "../controllers/tryonController.js";
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
 *     summary: Start a virtual try-on generation job (async — poll for the result)
 *     description: >
 *       Uploads a photo of the user (multipart/form-data) along with one or
 *       more garment images, queues generation against the external try-on
 *       microservice (TRYON_SERVICE_URL), and returns immediately with a
 *       'pending' job record — it does NOT wait for generation to finish
 *       (that routinely takes 25-40s, which is too long/fragile for a
 *       single synchronous HTTP request through production proxies/load
 *       balancers). Poll GET /tryon/{id}/status until status is
 *       'completed' or 'failed'. Garment images can be supplied either as
 *       directly-uploaded files ("cloth_images") or by referencing
 *       existing product image URLs ("clothImageUrls", a JSON-stringified
 *       array) — the server fetches those from Appwrite itself so the
 *       browser never has to, sidestepping Appwrite's CORS restrictions.
 *       At least one garment (file or URL) is required; up to 5 total.
 *     tags: [TryOn]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [productId, person_image]
 *             properties:
 *               productId: { type: string }
 *               person_image: { type: string, format: binary }
 *               cloth_images:
 *                 type: array
 *                 items: { type: string, format: binary }
 *               clothImageUrls:
 *                 type: string
 *                 description: JSON-stringified array of product image URLs to use as garments
 *     responses:
 *       202:
 *         description: Job queued — status is 'pending'; poll GET /tryon/{id}/status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Tryon' }
 *       400:
 *         description: Missing productId, person_image, or at least one garment image
 *       404:
 *         description: Product not found
 *       503:
 *         description: Virtual try-on is not configured on the server (missing TRYON_SERVICE_URL)
 */
router.route("/").get(getMyTryons).post(uploadTryonImages, processTryon);

/**
 * /tryon/{id}/status:
 *   get:
 *     summary: Poll the status of a try-on job started via POST /tryon
 *     tags: [TryOn]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Current job status — 'pending', 'completed' (imageUrl set), or 'failed' (error set)
 *       404:
 *         description: Job not found (or doesn't belong to the current user)
 */
router.get("/:id/status", getTryonStatus);

export default router;
