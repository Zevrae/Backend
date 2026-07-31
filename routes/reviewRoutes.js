import express from 'express';
import { createReview, getReviewsForProduct, updateReview, deleteReview } from '../controllers/reviewController.js';
import { protect } from '../middleware/auth.js';
import { uploadImages } from '../middleware/upload.js';

// mergeParams lets this router read :productId when mounted inside productRoutes
const router = express.Router({ mergeParams: true });

/**
 * @swagger
 * tags:
 *   name: Reviews
 *   description: Product reviews and ratings
 */

/**
 * @swagger
 * /products/{productId}/reviews:
 *   get:
 *     summary: List reviews for a product, with average rating
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Paginated reviews with a rating summary
 *   post:
 *     summary: Create a review for a product (one per user per product), optionally with photos
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [rating]
 *             properties:
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               comment: { type: string }
 *               images:
 *                 type: array
 *                 items: { type: string, format: binary }
 *                 description: Up to 5 photos, uploaded to Appwrite Storage
 *     responses:
 *       201:
 *         description: Review created
 */
router.route('/').get(getReviewsForProduct).post(protect, uploadImages, createReview);

// Mounted at /api/products/:productId/reviews
export default router;

// Standalone router for /api/reviews/:id (update/delete by review id)
const standaloneRouter = express.Router();

/**
 * @swagger
 * /reviews/{id}:
 *   put:
 *     summary: Update your own review (rating, comment, and/or photos — new photos replace the old set)
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               comment: { type: string }
 *               images:
 *                 type: array
 *                 items: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Review updated
 *       404:
 *         description: Review not found
 *   delete:
 *     summary: Soft-delete a review (owner, or admin for any review)
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Review soft-deleted
 *       404:
 *         description: Review not found
 */
standaloneRouter.put('/:id', protect, uploadImages, updateReview);
standaloneRouter.delete('/:id', protect, deleteReview);

export { standaloneRouter };
