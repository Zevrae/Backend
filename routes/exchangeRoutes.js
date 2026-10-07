import express from "express";
import { protect, authorize } from "../middleware/auth.js";
import {
  createExchangeRequest,
  getExchanges,
  getExchangeById,
  cancelExchangeRequest,
  updateExchangeStatus,
} from "../controllers/exchangeController.js";

const router = express.Router();

router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Exchanges
 *   description: Post-delivery item exchanges. Free for a same-product size swap; a flat fee (plus any price gap) applies when exchanging to a different product.
 */

/**
 * @swagger
 * /exchanges:
 *   get:
 *     summary: List exchanges (own orders, or all if admin)
 *     tags: [Exchanges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [requested, approved, picked_up, received, shipped, completed, rejected, cancelled] }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Paginated list of exchanges
 *   post:
 *     summary: Request an exchange for one item of a delivered order
 *     description: >
 *       Only available within 7 days of delivery. If new_product is the same
 *       as product (a size swap) it's free. If it's a different product, a
 *       flat exchange fee plus any price difference (when the new item costs
 *       more) is quoted in amount_due and collected offline at pickup — no
 *       online payment step.
 *     tags: [Exchanges]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orderId, product, new_product, reason]
 *             properties:
 *               orderId: { type: string }
 *               product: { type: string, description: "Original product id, as it appears on the order" }
 *               size: { type: string, description: "Original item's size, if any" }
 *               new_product: { type: string, description: "Same id as product for a size swap, or a different product's id" }
 *               new_size: { type: string }
 *               quantity: { type: integer, default: 1 }
 *               reason: { type: string }
 *     responses:
 *       201:
 *         description: Exchange requested
 *       400:
 *         description: Order not eligible, outside the exchange window, same size chosen for a size swap, or replacement out of stock
 *       404:
 *         description: Order or product not found
 *       409:
 *         description: There's already an open exchange for this item
 */
router.route("/").get(getExchanges).post(createExchangeRequest);

/**
 * @swagger
 * /exchanges/{id}:
 *   get:
 *     summary: Get a single exchange (owner or admin)
 *     tags: [Exchanges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Exchange found
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Exchange not found
 */
router.get("/:id", getExchangeById);

/**
 * @swagger
 * /exchanges/{id}/cancel:
 *   post:
 *     summary: Cancel an exchange (owner, only while status is 'requested'; admin can cancel anytime before it closes)
 *     tags: [Exchanges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Exchange cancelled
 *       400:
 *         description: Already past the point where self-serve cancellation is allowed
 */
router.post("/:id/cancel", cancelExchangeRequest);

/**
 * @swagger
 * /exchanges/{id}/status:
 *   patch:
 *     summary: Move an exchange through approved → picked_up → received → shipped → completed, or reject it (admin only)
 *     description: >
 *       Approving reserves the replacement item's stock; 'received' restocks
 *       the returned item; rejecting/cancelling after approval releases
 *       reserved stock. When amount_due > 0, send amount_collected true once
 *       the money's collected (typically at pickup) — 'shipped' is blocked
 *       until then.
 *     tags: [Exchanges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: string, enum: [approved, picked_up, received, shipped, completed, rejected, cancelled] }
 *               amount_collected: { type: boolean }
 *               admin_note: { type: string }
 *     responses:
 *       200:
 *         description: Exchange updated
 *       400:
 *         description: Already closed, or trying to ship before the amount due is collected
 *       409:
 *         description: Replacement item is out of stock
 */
router.patch("/:id/status", authorize("admin"), updateExchangeStatus);

export default router;
