import Order from "../models/Order.js";
import Cart, { MAX_QTY_PER_SIZE } from "../models/Cart.js";
import Product from "../models/Product.js";
import Analysis from "../models/Analysis.js";
import { getRazorpay, isRazorpayConfigured } from "../utils/razorpay.js";
import { applyDiscountCode, DiscountError } from "../utils/discounts.js";
import { sendEmail } from "../utils/sendEmail.js";

// Flat shipping fee (in rupees) for orders at/under the free-shipping
// threshold. Matches the frontend's checkout summary exactly.
export const SHIPPING_FEE = 49;
export const FREE_SHIPPING_THRESHOLD = 999;

// Flat handling charge added to Cash on Delivery orders (in rupees).
export const COD_HANDLING_FEE = 15;

// How long after placement a customer can still self-serve cancel an
// online-paid order.
const CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

// A product's demand counter crossing this many units-ordered triggers a
// "possible delay" heads-up email to the customer who just ordered it.
const DEMAND_ALERT_THRESHOLD = Number(process.env.DEMAND_ALERT_THRESHOLD) || 50;

// Best-effort: bump each ordered item's demand counter and, if a product has
// just crossed the alert threshold, let the customer know their order might
// be delayed. Never allowed to fail checkout — errors are swallowed.
export const recordDemandAndNotify = async (order, user) => {
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

// @desc    Initiate checkout (Freeze state for online, or place immediately for COD)
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

    const productIds = [
      ...new Set(cart.items.map((item) => item.product.toString())),
    ];
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
      if (item.quantity > MAX_QTY_PER_SIZE) {
        return res.status(400).json({
          success: false,
          message: `You can only order up to ${MAX_QTY_PER_SIZE} of "${item.name}"${item.size ? ` in size ${item.size}` : ""}. Please update your bag.`,
        });
      }

      const availableStock =
        product.inventory_mode === "size"
          ? (product.size_stock?.get(item.size) ?? 0)
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
        price: product.price,
        size: item.size,
        quantity: item.quantity,
      });
    }

    const subtotal = orderItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

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

    const shippingFee = subtotal > FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
    const handlingFee = method === "cod" ? COD_HANDLING_FEE : 0;
    const total = Math.max(
      0,
      subtotal - discountAmount + shippingFee + handlingFee,
    );

    // ==========================================
    // PATH A: CASH ON DELIVERY
    // Safe to create the order document immediately
    // ==========================================
    if (method === "cod") {
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
        order_status: "placed",
        payment_status: "pending", // Payment collected at door
      });

      cart.items = [];
      await cart.save();

      recordDemandAndNotify(order, req.user);

      return res.status(201).json({
        success: true,
        data: order,
        message:
          "Order created — cash on delivery, no online payment required.",
      });
    }

    // ==========================================
    // PATH B: ONLINE PAYMENT
    // Freeze checkout state to Cart, wait for webhook/verify
    // ==========================================
    if (!isRazorpayConfigured()) {
      return res.status(500).json({
        success: false,
        message: "Payment gateway is not configured on the server.",
      });
    }

    const rp = getRazorpay();
    const amountInPaise = Math.round(total * 100);
    const razorpayOrder = await rp.orders.create({
      amount: amountInPaise,
      currency: process.env.RAZORPAY_CURRENCY || "INR",
      notes: {
        userId: req.user._id.toString(),
      },
    });

    cart.checkout_state = {
      razorpay_order_id: razorpayOrder.id,
      shipping_address,
      discount_code: appliedCode,
      discount_amount: discountAmount,
      handling_fee: handlingFee,
      shipping_fee: shippingFee,
      subtotal,
      total,
    };
    await cart.save();

    return res.status(200).json({
      success: true,
      payment: {
        provider: "razorpay",
        key_id: process.env.RAZORPAY_KEY_ID,
        order_id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
      },
      message: "Checkout initiated. Waiting for payment verification.",
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

    // Ghost orders logic removed since they are no longer created in the DB!
    if (req.query.order_status) {
      filter.order_status = req.query.order_status;
    }

    if (req.query.payment_status) {
      filter.payment_status = req.query.payment_status;
    }
    if (req.query.payment_method) {
      filter.payment_method = req.query.payment_method;
    }

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
//          of when the order was placed.
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

// @desc    Update order/payment status, and/or the expected delivery date
//          (admin only)
// @route   PATCH /api/orders/:id/status
export const updateOrderStatus = async (req, res, next) => {
  try {
    const { order_status, payment_status, expected_delivery_date } = req.body;
    const updates = {};
    if (order_status) updates.order_status = order_status;
    if (payment_status) updates.payment_status = payment_status;
    if (expected_delivery_date !== undefined) {
      if (expected_delivery_date === null) {
        updates.expected_delivery_date = null;
      } else {
        const parsed = new Date(expected_delivery_date);
        if (Number.isNaN(parsed.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid expected_delivery_date",
          });
        }
        updates.expected_delivery_date = parsed;
      }
    }

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
