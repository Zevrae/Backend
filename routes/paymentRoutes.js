import express from 'express';
import { verifyPayment, razorpayWebhook } from '../controllers/paymentController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: Razorpay payment verification and webhooks
 */

/**
 * @swagger
 * /payments/verify:
 *   post:
 *     summary: Verify a Razorpay Checkout payment and mark the order as paid
 *     description: Call this from the client after Razorpay Checkout's success handler fires, with the three values it returns.
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [razorpay_order_id, razorpay_payment_id, razorpay_signature]
 *             properties:
 *               razorpay_order_id: { type: string }
 *               razorpay_payment_id: { type: string }
 *               razorpay_signature: { type: string }
 *     responses:
 *       200:
 *         description: Payment verified, order marked as paid
 *       400:
 *         description: Signature verification failed
 *       404:
 *         description: No order found for this Razorpay order id
 */
router.post('/verify', protect, verifyPayment);

/**
 * @swagger
 * /payments/webhook:
 *   post:
 *     summary: Razorpay webhook endpoint (configure this URL in the Razorpay dashboard)
 *     description: >
 *       Verifies the `X-Razorpay-Signature` header against the raw request body using
 *       RAZORPAY_WEBHOOK_SECRET, then updates the matching order on payment.captured / payment.failed.
 *       Not intended to be called directly by API consumers.
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: Event processed (or ignored if not relevant)
 *       400:
 *         description: Missing or invalid webhook signature
 */
router.post('/webhook', razorpayWebhook);

export default router;
