import express from 'express';
import {
  createDiscount,
  getDiscounts,
  getDiscountByCode,
  updateDiscount,
  deleteDiscount,
  useDiscount,
} from '../controllers/discountController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Discounts
 *   description: Coupon/discount codes
 */

/**
 * @swagger
 * /discounts:
 *   get:
 *     summary: List all discounts (admin only)
 *     tags: [Discounts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of discounts
 *   post:
 *     summary: Create a discount (admin only)
 *     tags: [Discounts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DiscountInput'
 *     responses:
 *       201:
 *         description: Discount created
 */
router.route('/').get(protect, authorize('admin'), getDiscounts).post(protect, authorize('admin'), createDiscount);

/**
 * @swagger
 * /discounts/use:
 *   post:
 *     summary: Validate a discount code against a subtotal and consume one use
 *     description: Requires login since a use is consumed immediately on success — intended for the "apply coupon" step of checkout.
 *     tags: [Discounts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, subtotal]
 *             properties:
 *               code: { type: string, example: SAVE20 }
 *               subtotal: { type: integer, description: 'Cart subtotal, in the smallest currency unit' }
 *     responses:
 *       200:
 *         description: Code applied — returns the computed discountAmount
 *       400:
 *         description: Code is inactive, expired, or at its usage limit
 *       404:
 *         description: Discount not found
 */
router.post('/use', protect, useDiscount);

/**
 * @swagger
 * /discounts/{code}:
 *   get:
 *     summary: Look up a discount by its code
 *     tags: [Discounts]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Discount found
 *       404:
 *         description: Discount not found
 */
router.get('/:code', getDiscountByCode);

/**
 * @swagger
 * /discounts/{id}:
 *   put:
 *     summary: Update a discount (admin only)
 *     tags: [Discounts]
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
 *             $ref: '#/components/schemas/DiscountInput'
 *     responses:
 *       200:
 *         description: Discount updated
 *   delete:
 *     summary: Soft-delete a discount (admin only)
 *     tags: [Discounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Discount soft-deleted
 */
router.route('/:id').put(protect, authorize('admin'), updateDiscount).delete(protect, authorize('admin'), deleteDiscount);

export default router;
