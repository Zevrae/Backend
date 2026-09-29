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
 *   description: >
 *     Post-delivery item exchanges. Size swaps (same product, different size)
 *     are completely free. Exchanging to a different product incurs a flat
 *     shipping charge (+ any price difference), collected at delivery time
 *     (COD-style) — no online payment gateway involved.
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
 *       Only available within 7 days of delivery. Size swaps (same product,
 *       different size) are free. Exchanging to a different product incurs a
 *       flat shipping charge plus any price difference if the replacement
 *       costs more — this amount is collected at delivery time (COD-style),
 *       not via any payment gateway.
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
 *               new_product: { type: string, description: "Replacement product id — can be the same product (size swap) or a different one" }
 *               new_size: { type: string }
 *               quantity: { type: integer, default: 1 }
 *               reason: { type: string }
 *     responses:
 *       201:
 *         description: Exchange requested
 *       400:
 *         description: Order not eligible, item not found, outside the exchange window, or replacement out of stock
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
 *     summary: Cancel an exchange request (owner, only while status is 'requested'; admin can cancel anytime)
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
 *       the returned item; rejecting or cancelling after approval releases any
 *       reserved stock. When transitioning to 'picked_up', the admin can also
 *       set amount_collected=true to confirm the delivery agent collected the
 *       due amount.
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
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [approved, picked_up, received, shipped, completed, rejected, cancelled] }
 *               admin_note: { type: string }
 *               amount_collected: { type: boolean, description: "Set to true when the delivery agent has collected the amount_due from the customer" }
 *     responses:
 *       200:
 *         description: Exchange updated
 *       400:
 *         description: Invalid transition (already closed)
 *       409:
 *         description: Replacement item is out of stock
 */
router.patch("/:id/status", authorize("admin"), updateExchangeStatus);

export default router;
