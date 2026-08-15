import Order from '../models/Order.js';
import Cart from '../models/Cart.js';
import { verifyPaymentSignature, verifyWebhookSignature } from '../utils/razorpay.js';

// Clears a user's cart. Called only at the moment an online order actually
// becomes PAID (from verifyPayment or the webhook) — never at order
// creation, and never on a failed/invalid payment. See createOrder in
// orderController.js for why COD orders clear the cart immediately instead.
const clearUserCart = (userId) => Cart.updateOne({ user: userId }, { $set: { items: [] } });

// @desc    Verify a Razorpay Checkout payment and mark the order as paid
// @route   POST /api/payments/verify
export const verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'razorpay_order_id, razorpay_payment_id, and razorpay_signature are required',
      });
    }

    const order = await Order.findOne({ razorpay_order_id }).select('+razorpay_signature');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found for this payment' });
    }
    if (req.user.role !== 'admin' && order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // Idempotent short-circuit: the webhook (a duplicate frontend call, or
    // a retry after a flaky network response) may have already confirmed
    // this exact payment. Treat a repeat call as success without
    // re-verifying or re-mutating anything.
    if (order.payment_status === 'paid') {
      return res.json({ success: true, message: 'Payment already verified', data: order });
    }

    const isValid = verifyPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });

    if (!isValid) {
      // Filtered on payment_status still != 'paid' in case the webhook won
      // a race and marked this PAID between our read above and this write
      // — a later/invalid verification call must never demote a
      // legitimately paid order back to failed.
      await Order.updateOne(
        { _id: order._id, payment_status: { $ne: 'paid' } },
        { $set: { payment_status: 'failed' } },
      );
      return res.status(400).json({ success: false, message: 'Payment signature verification failed' });
    }

    // Atomic, conditional transition: only ever moves a non-PAID order to
    // PAID, and only one caller (this endpoint or the webhook, whichever
    // gets here first) will see `updatedOrder` come back non-null. That's
    // what makes concurrent verify + webhook calls for the same payment
    // safe — exactly one of them performs the transition and clears the
    // cart; the other no-ops below.
    const updatedOrder = await Order.findOneAndUpdate(
      { _id: order._id, payment_status: { $ne: 'paid' } },
      {
        $set: {
          payment_status: 'paid',
          razorpay_payment_id,
          razorpay_signature,
          // Only a successful payment promotes the order out of
          // payment_pending — this is the moment it actually becomes
          // "placed". If it's already moved on (e.g. the webhook beat this
          // call to it and something else changed order_status further),
          // leave order_status alone rather than stomping on progress.
          ...(order.order_status === 'payment_pending' ? { order_status: 'placed' } : {}),
        },
      },
      { new: true },
    );

    if (updatedOrder) {
      // Cart is cleared only on the actual transition into PAID — never on
      // a failed attempt, and never twice for the same order.
      await clearUserCart(order.user);
    }

    const finalOrder = updatedOrder || (await Order.findById(order._id));
    res.json({ success: true, message: 'Payment verified successfully', data: finalOrder });
  } catch (err) {
    next(err);
  }
};

// @desc    Razorpay webhook — handles async payment events (captured/failed) as a
//          more reliable source of truth than relying solely on the client-side
//          verify call (e.g. if the user closes the tab before it fires).
// @route   POST /api/payments/webhook
export const razorpayWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    if (!signature || !req.rawBody) {
      return res.status(400).json({ success: false, message: 'Missing signature or request body' });
    }

    const isValid = verifyWebhookSignature(req.rawBody, signature);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    const { event, payload } = req.body;
    const paymentEntity = payload?.payment?.entity;
    const razorpayOrderId = paymentEntity?.order_id;

    if (razorpayOrderId) {
      const order = await Order.findOne({ razorpay_order_id: razorpayOrderId });
      if (order) {
        if (event === 'payment.captured') {
          // Same atomic, conditional transition as verifyPayment — acts as
          // the failsafe path for when the customer's browser closes or the
          // network drops before the frontend's own /verify call fires.
          // Guarding on payment_status != 'paid' makes repeated/duplicate
          // webhook deliveries for the same event safe (Razorpay retries
          // webhooks that don't get a 200 back), and means this can race
          // safely against a concurrent /verify call for the same order.
          const updatedOrder = await Order.findOneAndUpdate(
            { _id: order._id, payment_status: { $ne: 'paid' } },
            {
              $set: {
                payment_status: 'paid',
                razorpay_payment_id: paymentEntity.id,
                ...(order.order_status === 'payment_pending' ? { order_status: 'placed' } : {}),
              },
            },
            { new: true },
          );
          if (updatedOrder) {
            await clearUserCart(order.user);
          }
        } else if (event === 'payment.failed') {
          // Out-of-order or duplicate delivery must never downgrade an
          // order that's already been confirmed PAID — e.g. Razorpay
          // redelivers a stale payment.failed for a payment that was
          // subsequently retried and captured, or the events simply arrive
          // out of order.
          await Order.updateOne(
            { _id: order._id, payment_status: { $ne: 'paid' } },
            { $set: { payment_status: 'failed' } },
          );
        }
      }
    }

    // Always 200 so Razorpay doesn't keep retrying once we've processed it
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
