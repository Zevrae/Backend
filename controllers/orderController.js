import Order from "../models/Order.js";
import Cart from "../models/Cart.js";
import Product from "../models/Product.js";
import Analysis from "../models/Analysis.js";
import { getRazorpay, isRazorpayConfigured } from "../utils/razorpay.js";
import { applyDiscountCode, DiscountError } from "../utils/discounts.js";
import { sendEmail } from "../utils/sendEmail.js";

// Flat shipping fee (in rupees) for orders at/under the free-shipping
// threshold. Matches the frontend's checkout summary exactly — keep these
// in sync if either changes. Rule is strictly "subtotal > threshold", so a
// subtotal exactly equal to the threshold still pays shipping.
const SHIPPING_FEE = 59;
const FREE_SHIPPING_THRESHOLD = 999;

// Flat handling charge added to Cash on Delivery orders (in rupees). Covers
// the extra cost of collecting payment at the doorstep. Keep in sync with
// the frontend checkout summary if this ever changes.
const COD_HANDLING_FEE = 15;

// How long after placement a customer can still self-serve cancel an
// online-paid order. Cash on Delivery orders aren't eligible for self-serve
// cancellation here (nothing has been charged yet — the customer can simply
// refuse delivery), so this window only applies to `payment_method: 'online'`.
const CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

// A product's demand counter crossing this many units-ordered triggers a
// "possible delay" heads-up email to the customer who just ordered it.
// Set DEMAND_ALERT_THRESHOLD=0 to disable.
const DEMAND_ALERT_THRESHOLD = Number(process.env.DEMAND_ALERT_THRESHOLD) || 50;

// Best-effort: bump each ordered item's demand counter and, if a product has
// just crossed the alert threshold, let the customer know their order might
// be delayed. Never allowed to fail checkout — errors are swallowed.
const recordDemandAndNotify = async (order, user) => {
  try {
    const highDemandItems = [];

    for (const item of order.items) {
      const analysis = await Analysis.findOneAndUpdate(
        { productId: item.product },
        { $inc: { demandCounter: item.quantity } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );

      if (
        DEMAND_ALERT_THRESHOLD > 0 &&
        analysis.demandCounter >= DEMAND_ALERT_THRESHOLD
      ) {
        highDemandItems.push(item.name);
      }
    }

    if (highDemandItems.length > 0) {
      await sendEmail({
        to: user.email,
        subject: "A quick note about your recent order",
        html: `
          <p>Hi ${user.name},</p>
          <p>Thanks for your order! Due to high demand, the following item(s) may ship
          with a short delay: <strong>${highDemandItems.join(", ")}</strong>.</p>
          <p>We'll keep you updated on your order (#${order._id}) as it progresses.</p>
        `,
      });
    }
  } catch (err) {
    console.error("recordDemandAndNotify failed (non-blocking):", err.message);
  }
};

// @desc    Place an order from the current cart, and open a Razorpay order for payment
// @route   POST /api/orders
export const createOrder = async (req, res, next) => {
  try {
    const { shipping_address, discount_code, payment_method } = req.body;
    if (!shipping_address) {
      return res
        .status(400)
        .json({ success: false, message: "Shipping address is required" });
    }
    const method = payment_method === "cod" ? "cod" : "online";

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    // The cart only stores a *snapshot* of each product's name/price taken
    // at the moment it was added (see cartController.addItem) — it is never
    // trustworthy as-is for what the customer is actually charged. Re-fetch
    // every product fresh right now and rebuild the order's line items from
    // that, so the price paid always matches the database's current price,
    // and anything that went inactive/was deleted since it was added to the
    // cart is caught before an order (or a Razorpay charge) is created for it.
    const productIds = [...new Set(cart.items.map((item) => item.product.toString()))];
    const products = await Product.find({ _id: { $in: productIds } });
    const productById = new Map(products.map((p) => [p._id.toString(), p]));

    const orderItems = [];
    for (const item of cart.items) {
      const product = productById.get(item.product.toString());
      if (!product || product.status !== "active") {
        return res.status(400).json({
          success: false,
          message: `"${item.name}" is no longer available. Please remove it from your bag and try again.`,
        });
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        return res.status(400).json({
          success: false,
          message: `Invalid quantity for "${item.name}"`,
        });
      }

      const availableStock =
        product.inventory_mode === "size"
          ? product.size_stock?.get(item.size) ?? 0
          : product.stock_quantity;
      if (availableStock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${availableStock} of "${item.name}" left in stock.`,
        });
      }

      orderItems.push({
        product: product._id,
        name: product.name,
        // Authoritative, server-fetched price — the cart's copy is only
        // ever used to know *which* products/quantities are in the cart.
        price: product.price,
        size: item.size,
        quantity: item.quantity,
      });
    }

    const subtotal = orderItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    // Apply a discount code, if provided. This consumes one use of the code
    // immediately — if Razorpay order creation fails afterwards, the use
    // isn't refunded automatically (no multi-document transaction here,
    // since that requires a Mongo replica set). Acceptable tradeoff for now;
    // revisit with transactions if this becomes a real support burden.
    let discountAmount = 0;
    let appliedCode = null;
    if (discount_code) {
      try {
        const result = await applyDiscountCode(discount_code, subtotal);
        discountAmount = result.discountAmount;
        appliedCode = result.discount.code;
      } catch (err) {
        if (err instanceof DiscountError) {
          return res
            .status(err.statusCode)
            .json({ success: false, message: err.message });
        }
        throw err;
      }
    }

    // Everything on the Order document — subtotal, shipping_fee,
    // discount_amount, total — is stored in rupees, matching Product.price
    // and every other money value shown in the app. Razorpay is the only
    // API that wants the smallest currency unit (paise for INR); that
    // conversion happens once, right when we call it below, and nowhere
    // else. Mixing units between here and there was the root cause of the
    // "order total is 100x too big" bug.
    const shippingFee = subtotal > FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
    const handlingFee = method === "cod" ? COD_HANDLING_FEE : 0;
    const total = Math.max(0, subtotal - discountAmount + shippingFee + handlingFee);

    // Online orders aren't "placed" until the payment actually succeeds —
    // they sit in payment_pending until paymentController.verifyPayment (or
    // the Razorpay webhook) confirms the charge went through. COD orders
    // have nothing to wait on, so they're placed immediately.
    const initialOrderStatus = method === "cod" ? "placed" : "payment_pending";

    const order = await Order.create({
      user: req.user._id,
      items: orderItems,
      shipping_address,
      subtotal,
      shipping_fee: shippingFee,
      handling_fee: handlingFee,
      discount_code: appliedCode,
      discount_amount: discountAmount,
      total,
      payment_method: method,
      order_status: initialOrderStatus,
    });

    // Cash on Delivery orders are placed immediately — there's no payment
    // left to wait on, so it's safe to empty the cart right now. Online
    // orders are deliberately NOT cleared here: payment hasn't succeeded
    // yet at this point, and clearing the cart before that would lose the
    // customer's items if the payment fails, they abandon Razorpay
    // Checkout, or their browser closes mid-payment. For online orders the
    // cart is instead cleared the moment payment_status actually flips to
    // 'paid' — see paymentController.verifyPayment / razorpayWebhook.
    if (method === "cod") {
      cart.items = [];
      await cart.save();
    }

    let razorpayOrder = null;
    if (method === "online" && isRazorpayConfigured()) {
      const rp = getRazorpay();
      // Razorpay requires the amount in the smallest currency unit (paise
      // for INR) — this is the ONLY place that conversion should happen.
      const amountInPaise = Math.round(total * 100);
      razorpayOrder = await rp.orders.create({
        amount: amountInPaise,
        currency: process.env.RAZORPAY_CURRENCY || "INR",
        receipt: order._id.toString(),
        notes: {
          orderId: order._id.toString(),
          userId: req.user._id.toString(),
        },
      });

      order.razorpay_order_id = razorpayOrder.id;
      await order.save();
    }

    // Fire-and-forget — never blocks or fails the checkout response
    recordDemandAndNotify(order, req.user);

    res.status(201).json({
      success: true,
      data: order,
      payment: razorpayOrder
        ? {
            provider: "razorpay",
            key_id: process.env.RAZORPAY_KEY_ID,
            order_id: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
          }
        : null,
      message: razorpayOrder
        ? "Order created — use the payment details to open Razorpay Checkout, then call POST /api/payments/verify."
        : method === "cod"
          ? "Order created — cash on delivery, no online payment required."
          : "Order created. Payment gateway is not configured on the server.",
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get orders for the current user (or all orders if admin)
// @route   GET /api/orders
export const getOrders = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const filter = req.user.role === "admin" ? {} : { user: req.user._id };
    if (req.query.order_status) {
      filter.order_status = req.query.order_status;
    } else if (req.user.role === "admin") {
      // An online order that's still waiting on payment confirmation isn't
      // a real order yet from the business's point of view — it might be
      // an abandoned or failed Razorpay checkout that never completes. The
      // admin orders panel hides these by default so they don't clutter
      // the list; pass ?order_status=payment_pending explicitly to see
      // them (e.g. for support/troubleshooting). The customer's own order
      // history is unaffected — they should still see "Awaiting payment"
      // for their own in-progress checkout.
      filter.order_status = { $ne: "payment_pending" };
    }
    if (req.query.payment_status)
      filter.payment_status = req.query.payment_status;
    if (req.query.payment_method)
      filter.payment_method = req.query.payment_method;

    const [items, total] = await Promise.all([
      Order.find(filter)
        .populate("user", "name email phone")
        .sort("-created_at")
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get a single order (owner or admin)
// @route   GET /api/orders/:id
export const getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("user", "name email phone")
      .lean();
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });

    if (
      req.user.role !== "admin" &&
      order.user.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};

// @desc    Cancel an order (owner or admin). Self-serve cancellation is only
//          offered for online-paid orders, and only within a 24-hour window
//          of when the order was placed — after that (or for COD, or once
//          an order has shipped) the customer needs to contact support.
// @route   POST /api/orders/:id/cancel
export const cancelOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const isOwner = order.user.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    if (order.order_status === "cancelled") {
      return res
        .status(400)
        .json({ success: false, message: "This order is already cancelled" });
    }
    if (["shipped", "delivered"].includes(order.order_status)) {
      return res.status(400).json({
        success: false,
        message: `This order has already been ${order.order_status} and can no longer be cancelled.`,
      });
    }

    // Admins can override; self-serve cancellation (by the order's owner)
    // is restricted to paid online orders, within the cancellation window.
    if (req.user.role !== "admin") {
      if (order.payment_method !== "online") {
        return res.status(400).json({
          success: false,
          message:
            "Cash on Delivery orders can't be cancelled online — please contact support, or simply decline the order at delivery.",
        });
      }
      if (order.payment_status !== "paid") {
        return res.status(400).json({
          success: false,
          message: "This order can't be cancelled until payment is confirmed.",
        });
      }
      const elapsedMs = Date.now() - order.created_at.getTime();
      if (elapsedMs > CANCELLATION_WINDOW_MS) {
        return res.status(400).json({
          success: false,
          message:
            "The 24-hour cancellation window for this order has passed. Please contact support.",
        });
      }
    }

    order.order_status = "cancelled";
    await order.save();

    res.json({ success: true, message: "Order cancelled", data: order });
  } catch (err) {
    next(err);
  }
};

// @desc    Update order/payment status (admin only)
// @route   PATCH /api/orders/:id/status
export const updateOrderStatus = async (req, res, next) => {
  try {
    const { order_status, payment_status } = req.body;
    const updates = {};
    if (order_status) updates.order_status = order_status;
    if (payment_status) updates.payment_status = payment_status;

    const order = await Order.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });

    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};
