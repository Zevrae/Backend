import express from "express";
import { proxyImage } from "../controllers/imageController.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Images
 *   description: Server-side proxy for Appwrite-hosted images (works around Appwrite's CORS restrictions)
 */

/**
 * @swagger
 * /images/proxy:
 *   get:
 *     summary: Proxy an Appwrite-hosted image's bytes through the backend
 *     description: >
 *       Appwrite Storage's CORS policy blocks the frontend from directly
 *       fetching image bytes (e.g. to convert a product image into a File
 *       for try-on, or to force-download a generated image). This route
 *       fetches the file server-side via the Appwrite SDK, where CORS
 *       doesn't apply, and streams it back.
 *     tags: [Images]
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema: { type: string }
 *         description: The full Appwrite file view URL (must be on this app's Appwrite endpoint)
 *     responses:
 *       200:
 *         description: The raw image bytes
 *       400:
 *         description: Missing or non-Appwrite url
 */
router.get("/proxy", proxyImage);

export default router;
