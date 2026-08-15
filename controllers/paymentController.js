import Order from "../models/Order.js";
import Cart from "../models/Cart.js";
import User from "../models/User.js";
import {
  verifyPaymentSignature,
  verifyWebhookSignature,
} from "../utils/razorpay.js";
// Import this from your order controller or shared utilities
import { recordDemandAndNotify } from "./orderController.js";

// @desc    Verify a Razorpay Checkout payment and create the official Order
// @route   POST /api/payments/verify
export const verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message:
          "razorpay_order_id, razorpay_payment_id, and razorpay_signature are required",
      });
    }

    // 1. Cryptographically verify the signature first
    const isValid = verifyPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });

    if (!isValid) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Payment signature verification failed",
        });
    }

    // 2. Find the Cart holding the frozen checkout state
    const cart = await Cart.findOne({
      "checkout_state.razorpay_order_id": razorpay_order_id,
    });

    // Idempotent short-circuit: If the cart isn't found, the webhook likely beat this call
    // and already processed it. Verify it exists in the Orders collection.
    if (!cart || !cart.checkout_state) {
      const existingOrder = await Order.findOne({ razorpay_order_id });
      if (existingOrder && existingOrder.payment_status === "paid") {
        return res.json({
          success: true,
          message: "Payment already verified",
          data: existingOrder,
        });
      }
      return res
        .status(404)
        .json({
          success: false,
          message: "Checkout session not found or already processed.",
        });
    }

    // 3. Create the OFFICIAL order now that payment is guaranteed
    const state = cart.checkout_state;
    const orderItems = cart.items.map((item) => ({
      product: item.product,
      name: item.name,
      price: item.price,
      size: item.size,
      quantity: item.quantity,
    }));

    const order = await Order.create({
      user: cart.user,
      items: orderItems,
      shipping_address: state.shipping_address,
      subtotal: state.subtotal,
      shipping_fee: state.shipping_fee,
      handling_fee: state.handling_fee,
      discount_code: state.discount_code,
      discount_amount: state.discount_amount,
      total: state.total,
      payment_method: "online",
      order_status: "placed",
      payment_status: "paid",
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });

    // 4. Wipe the cart clean and remove the temporary state
    await Cart.updateOne(
      { _id: cart._id },
      {
        $set: { items: [] },
        $unset: { checkout_state: "" },
      },
    );

    // 5. Fire post-order side effects (emails, stock counting)
    const user = await User.findById(cart.user);
    if (user) {
      recordDemandAndNotify(order, user);
    }

    res.json({
      success: true,
      message: "Payment verified successfully",
      data: order,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Razorpay webhook — handles async payment events as a reliable failsafe
// @route   POST /api/payments/webhook
export const razorpayWebhook = async (req, res, next) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    if (!signature || !req.rawBody) {
      return res
        .status(400)
        .json({ success: false, message: "Missing signature or request body" });
    }

    const isValid = verifyWebhookSignature(req.rawBody, signature);
    if (!isValid) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid webhook signature" });
    }

    const { event, payload } = req.body;
    const paymentEntity = payload?.payment?.entity;
    const razorpayOrderId = paymentEntity?.order_id;

    if (razorpayOrderId && event === "payment.captured") {
      const cart = await Cart.findOne({
        "checkout_state.razorpay_order_id": razorpayOrderId,
      });

      if (cart && cart.checkout_state) {
        // The webhook won the race against the frontend /verify endpoint.
        // Create the order using the frozen state.
        const state = cart.checkout_state;
        const orderItems = cart.items.map((item) => ({
          product: item.product,
          name: item.name,
          price: item.price,
          size: item.size,
          quantity: item.quantity,
        }));

        const order = await Order.create({
          user: cart.user,
          items: orderItems,
          shipping_address: state.shipping_address,
          subtotal: state.subtotal,
          shipping_fee: state.shipping_fee,
          handling_fee: state.handling_fee,
          discount_code: state.discount_code,
          discount_amount: state.discount_amount,
          total: state.total,
          payment_method: "online",
          order_status: "placed",
          payment_status: "paid",
          razorpay_order_id: razorpayOrderId,
          razorpay_payment_id: paymentEntity.id,
        });

        // Clear cart
        await Cart.updateOne(
          { _id: cart._id },
          {
            $set: { items: [] },
            $unset: { checkout_state: "" },
          },
        );

        // Notify
        const user = await User.findById(cart.user);
        if (user) {
          recordDemandAndNotify(order, user);
        }
      }
    }

    // Always 200 so Razorpay doesn't keep retrying once processed
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
