import express from 'express';
import {
  createOrder,
  getOrders,
  getOrderById,
  cancelOrder,
  updateOrderStatus,
} from '../controllers/orderController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Checkout and order tracking
 */

/**
 * @swagger
 * /orders:
 *   get:
 *     summary: List orders (own orders, or all orders if admin)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: order_status
 *         schema: { type: string, enum: [payment_pending, placed, processing, shipped, delivered, cancelled] }
 *       - in: query
 *         name: payment_status
 *         schema: { type: string, enum: [pending, paid, failed, refunded] }
 *     responses:
 *       200:
 *         description: Paginated list of orders
 *   post:
 *     summary: Checkout — create an order from the current cart
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateOrderInput'
 *     responses:
 *       201:
 *         description: Order created — includes Razorpay payment details to open Checkout with, if configured
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Order' }
 *                 payment: { $ref: '#/components/schemas/PaymentInfo' }
 *       400:
 *         description: Cart is empty or shipping address missing
 */
router.route('/').get(getOrders).post(createOrder);

/**
 * @swagger
 * /orders/{id}:
 *   get:
 *     summary: Get a single order (owner or admin)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Order found
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Order not found
 */
router.get('/:id', getOrderById);

/**
 * @swagger
 * /orders/{id}/cancel:
 *   post:
 *     summary: Cancel an order (owner or admin). Self-serve cancellation is only available for paid online orders within 24 hours of placement.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Order cancelled
 *       400:
 *         description: Order isn't eligible for cancellation
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Order not found
 */
router.post('/:id/cancel', cancelOrder);

/**
 * @swagger
 * /orders/{id}/status:
 *   patch:
 *     summary: Update order/payment status and/or the expected delivery date (admin only)
 *     tags: [Orders]
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
 *             type: object
 *             properties:
 *               order_status: { type: string, enum: [payment_pending, placed, processing, shipped, delivered, cancelled] }
 *               payment_status: { type: string, enum: [pending, paid, failed, refunded] }
 *               expected_delivery_date: { type: string, format: date-time, description: "Defaults to 7 days after the order date; admins can override it." }
 *     responses:
 *       200:
 *         description: Order updated
 *       404:
 *         description: Order not found
 */
router.patch('/:id/status', authorize('admin'), updateOrderStatus);

export default router;
