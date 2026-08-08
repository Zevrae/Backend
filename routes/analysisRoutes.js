import { Router } from 'express';
import { getAnalysis, getAnalysisSummary, updateAnalysis } from '../controllers/analysisController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Analysis
 *   description: Per-product demand analytics (admin only)
 */

/**
 * @swagger
 * /analysis:
 *   get:
 *     summary: List demand-counter analytics for all products (admin only)
 *     tags: [Analysis]
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
 *         description: Paginated list of per-product demand analytics, sorted by demand descending
 *   put:
 *     summary: Manually adjust a product's demand counter (admin only)
 *     description: >
 *       The counter is normally incremented automatically when an order is placed
 *       (see POST /orders). This endpoint is for admin corrections/testing.
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId]
 *             properties:
 *               productId: { type: string }
 *               incrementBy: { type: integer, default: 1 }
 *     responses:
 *       200:
 *         description: Updated (or newly created) analysis record
 *       404:
 *         description: Product not found
 */
/**
 * @swagger
 * /analysis/summary:
 *   get:
 *     summary: Category-level demand breakdown and restocking insights (admin only)
 *     description: >
 *       Returns three views: demand totals grouped by category, the top 10
 *       products overall by combined demand, and — the most actionable list —
 *       products with active "notify me" signups that are currently out of
 *       stock (real, unfulfilled demand).
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Aggregated demand insights
 */
router.get('/summary', protect, authorize('admin'), getAnalysisSummary);
router.get('/', protect, authorize('admin'), getAnalysis);
router.put('/', protect, authorize('admin'), updateAnalysis);

export default router;
