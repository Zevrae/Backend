import Order from '../models/Order.js';
import { verifyPaymentSignature, verifyWebhookSignature } from '../utils/razorpay.js';

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

    const isValid = verifyPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });

    if (!isValid) {
      order.payment_status = 'failed';
      await order.save();
      return res.status(400).json({ success: false, message: 'Payment signature verification failed' });
    }

    order.payment_status = 'paid';
    order.order_status = 'processing';
    order.razorpay_payment_id = razorpay_payment_id;
    order.razorpay_signature = razorpay_signature;
    await order.save();

    res.json({ success: true, message: 'Payment verified successfully', data: order });
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
          order.payment_status = 'paid';
          order.order_status = order.order_status === 'placed' ? 'processing' : order.order_status;
          order.razorpay_payment_id = paymentEntity.id;
        } else if (event === 'payment.failed') {
          order.payment_status = 'failed';
        }
        await order.save();
      }
    }

    // Always 200 so Razorpay doesn't keep retrying once we've processed it
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
