import express from 'express';
import { createReview, getReviewsForProduct, updateReview, deleteReview } from '../controllers/reviewController.js';
import { protect } from '../middleware/auth.js';

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
 *     summary: Create a review for a product (one per user per product)
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
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReviewInput'
 *     responses:
 *       201:
 *         description: Review created
 */
router.route('/').get(getReviewsForProduct).post(protect, createReview);

// Mounted at /api/products/:productId/reviews
export default router;

// Standalone router for /api/reviews/:id (update/delete by review id)
const standaloneRouter = express.Router();

/**
 * @swagger
 * /reviews/{id}:
 *   put:
 *     summary: Update your own review
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
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReviewInput'
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
standaloneRouter.put('/:id', protect, updateReview);
standaloneRouter.delete('/:id', protect, deleteReview);

export { standaloneRouter };
