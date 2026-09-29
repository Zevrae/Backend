import mongoose from "mongoose";
import Exchange, { CLOSED_EXCHANGE_STATUSES } from "../models/Exchange.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";

export const EXCHANGE_SHIPPING_FEE =
  Number(process.env.EXCHANGE_SHIPPING_FEE) || 99;

const EXCHANGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const availableStockFor = (product, size) =>
  product.inventory_mode === "size"
    ? (product.size_stock?.get(size) ?? 0)
    : product.stock_quantity;

// @desc    Request an exchange for one item of a delivered order
// @route   POST /api/exchanges
export const createExchangeRequest = async (req, res, next) => {
  try {
    const { orderId, product, size, new_product, new_size, quantity, reason } =
      req.body;

    if (!orderId || !product || !new_product || !reason) {
      return res.status(400).json({
        success: false,
        message: "orderId, product, new_product, and reason are required",
      });
    }
    const qty = Number.isInteger(quantity) && quantity > 0 ? quantity : 1;

    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    if (order.order_status !== "delivered") {
      return res.status(400).json({
        success: false,
        message: "Only delivered orders are eligible for exchange",
      });
    }

    const deliveredAt = order.delivered_at || order.updated_at;
    if (Date.now() - deliveredAt.getTime() > EXCHANGE_WINDOW_MS) {
      return res.status(400).json({
        success: false,
        message: "The 7-day exchange window for this order has passed.",
      });
    }

    const orderItem = order.items.find(
      (i) =>
        i.product.toString() === product && (i.size || "") === (size || ""),
    );
    if (!orderItem) {
      return res.status(404).json({
        success: false,
        message: "That item wasn't found on this order",
      });
    }
    if (qty > orderItem.quantity) {
      return res.status(400).json({
        success: false,
        message: `You only ordered ${orderItem.quantity} of this item`,
      });
    }

    const existingOpen = await Exchange.findOne({
      order: order._id,
      "original_item.product": product,
      "original_item.size": size || "",
      is_open: true,
    });
    if (existingOpen) {
      return res.status(409).json({
        success: false,
        message: "There's already an open exchange for this item",
      });
    }

    const originalProduct = await Product.findById(product);
    if (!originalProduct) {
      return res
        .status(404)
        .json({ success: false, message: "Original product not found" });
    }
    if (originalProduct.is_customized) {
      return res.status(400).json({
        success: false,
        message: "Customized products can't be exchanged",
      });
    }

    const newProduct = await Product.findById(new_product);
    if (!newProduct || newProduct.status !== "active") {
      return res.status(404).json({
        success: false,
        message: "The requested replacement product isn't available",
      });
    }
    if (newProduct.is_customized) {
      return res.status(400).json({
        success: false,
        message: "Customized products can't be chosen as a replacement",
      });
    }
    if (newProduct.inventory_mode === "size" && !new_size) {
      return res.status(400).json({
        success: false,
        message: "new_size is required for this product",
      });
    }
    const stockAvailable = availableStockFor(newProduct, new_size);
    if (stockAvailable < qty) {
      return res.status(400).json({
        success: false,
        message: `Only ${stockAvailable} of "${newProduct.name}" left in the requested size`,
      });
    }

    const isSizeSwap = product === new_product.toString();

    let exchangeFee = 0;
    let priceDifference = 0;
    let amountDue = 0;

    if (!isSizeSwap) {
      exchangeFee = EXCHANGE_SHIPPING_FEE;
      priceDifference = Math.max(0, (newProduct.price - orderItem.price) * qty);
      amountDue = exchangeFee + priceDifference;
    }

    const exchange = await Exchange.create({
      order: order._id,
      user: req.user._id,
      original_item: {
        product: originalProduct._id,
        name: orderItem.name,
        price: orderItem.price,
        size: size || "",
        quantity: qty,
      },
      new_item: {
        product: newProduct._id,
        name: newProduct.name,
        price: newProduct.price,
        size: new_size || "",
        quantity: qty,
      },
      is_size_swap: isSizeSwap,
      reason,
      exchange_fee: exchangeFee,
      price_difference: priceDifference,
      amount_due: amountDue,
    });

    res.status(201).json({
      success: true,
      data: exchange,
      message: isSizeSwap
        ? "Size exchange requested — no charges apply."
        : `Exchange requested — ₹${amountDue} will be collected at delivery.`,
    });
  } catch (err) {
    next(err);
  }
};

export const getExchanges = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const filter = req.user.role === "admin" ? {} : { user: req.user._id };
    if (req.query.status) filter.status = req.query.status;

    const [items, total] = await Promise.all([
      Exchange.find(filter)
        .populate("user", "name email phone")
        .populate("order", "created_at total")
        .sort("-created_at")
        .skip(skip)
        .limit(limit)
        .lean(),
      Exchange.countDocuments(filter),
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

// @desc    Get a single exchange (owner or admin)
// @route   GET /api/exchanges/:id
export const getExchangeById = async (req, res, next) => {
  try {
    const exchange = await Exchange.findById(req.params.id)
      .populate("user", "name email phone")
      .populate("order");
    if (!exchange) {
      return res
        .status(404)
        .json({ success: false, message: "Exchange not found" });
    }
    // After .populate("user"), exchange.user is an object — extract _id.
    const exchangeUserId = exchange.user?._id ?? exchange.user;
    if (
      req.user.role !== "admin" &&
      exchangeUserId.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    res.json({ success: true, data: exchange });
  } catch (err) {
    next(err);
  }
};

// @desc    Cancel an exchange request (owner, while still 'requested')
// @route   POST /api/exchanges/:id/cancel
export const cancelExchangeRequest = async (req, res, next) => {
  try {
    const exchange = await Exchange.findById(req.params.id);
    if (!exchange) {
      return res
        .status(404)
        .json({ success: false, message: "Exchange not found" });
    }
    const isOwner = exchange.user.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    if (req.user.role !== "admin" && exchange.status !== "requested") {
      return res.status(400).json({
        success: false,
        message:
          "This exchange has already been processed and can no longer be cancelled directly — please contact support.",
      });
    }

    exchange.status = "cancelled";
    await exchange.save();

    res.json({ success: true, message: "Exchange cancelled", data: exchange });
  } catch (err) {
    next(err);
  }
};

// Core status-update logic, extracted so it can run with or without a
// Mongo session (standalone dev instances don't support transactions).
async function applyStatusUpdate(
  exchangeId,
  { status, admin_note, amount_collected },
  session,
) {
  const opts = session ? { session } : {};
  const exchange = session
    ? await Exchange.findById(exchangeId).session(session)
    : await Exchange.findById(exchangeId);

  if (!exchange) {
    throw Object.assign(new Error("Exchange not found"), { statusCode: 404 });
  }
  if (CLOSED_EXCHANGE_STATUSES.includes(exchange.status)) {
    throw Object.assign(
      new Error(
        `This exchange is already ${exchange.status} and can't be updated further`,
      ),
      { statusCode: 400 },
    );
  }

  // Reserve the replacement item's stock the moment an exchange is
  // approved, mirroring how checkout reserves stock at order creation.
  if (status === "approved" && !exchange.stock_reserved) {
    const newProduct = session
      ? await Product.findById(exchange.new_item.product).session(session)
      : await Product.findById(exchange.new_item.product);
    if (!newProduct) {
      throw Object.assign(new Error("Replacement product no longer exists"), {
        statusCode: 404,
      });
    }
    const qty = exchange.new_item.quantity;

    if (newProduct.inventory_mode === "size") {
      const current = newProduct.size_stock.get(exchange.new_item.size) ?? 0;
      if (current < qty) {
        throw Object.assign(new Error("Replacement item is out of stock"), {
          statusCode: 409,
        });
      }
      newProduct.size_stock.set(exchange.new_item.size, current - qty);
    } else {
      if (newProduct.stock_quantity < qty) {
        throw Object.assign(new Error("Replacement item is out of stock"), {
          statusCode: 409,
        });
      }
      newProduct.stock_quantity -= qty;
    }
    await newProduct.save(opts);
    exchange.stock_reserved = true;
  }

  // When the original item is picked up, the delivery agent also
  // collects any due amount (shipping charge + price difference) —
  // admin marks amount_collected = true at the same time.
  if (status === "picked_up" && exchange.amount_due > 0) {
    if (amount_collected !== undefined) {
      exchange.amount_collected = Boolean(amount_collected);
    }
  }

  // Put the returned item back into sellable stock once it's actually
  // back in the warehouse.
  if (status === "received" && !exchange.original_restocked) {
    const originalProduct = session
      ? await Product.findById(exchange.original_item.product).session(session)
      : await Product.findById(exchange.original_item.product);
    if (originalProduct) {
      const qty = exchange.original_item.quantity;
      if (originalProduct.inventory_mode === "size") {
        const current =
          originalProduct.size_stock.get(exchange.original_item.size) ?? 0;
        originalProduct.size_stock.set(
          exchange.original_item.size,
          current + qty,
        );
      } else {
        originalProduct.stock_quantity += qty;
      }
      await originalProduct.save(opts);
    }
    exchange.original_restocked = true;
  }

  // Release reserved stock if the exchange is rejected/cancelled after
  // approval (stock was already decremented).
  if (
    ["rejected", "cancelled"].includes(status) &&
    exchange.stock_reserved &&
    exchange.status !== "cancelled"
  ) {
    const newProduct = session
      ? await Product.findById(exchange.new_item.product).session(session)
      : await Product.findById(exchange.new_item.product);
    if (newProduct) {
      const qty = exchange.new_item.quantity;
      if (newProduct.inventory_mode === "size") {
        const current = newProduct.size_stock.get(exchange.new_item.size) ?? 0;
        newProduct.size_stock.set(exchange.new_item.size, current + qty);
      } else {
        newProduct.stock_quantity += qty;
      }
      await newProduct.save(opts);
    }
  }

  exchange.status = status;
  if (admin_note !== undefined) exchange.admin_note = admin_note;
  // Allow admin to mark amount_collected on any status update
  if (amount_collected !== undefined) {
    exchange.amount_collected = Boolean(amount_collected);
  }
  await exchange.save(opts);
  return exchange;
}

// @desc    Move an exchange through its lifecycle (admin only)
// @route   PATCH /api/exchanges/:id/status
export const updateExchangeStatus = async (req, res, next) => {
  try {
    const { status, admin_note, amount_collected } = req.body;
    if (!status) {
      return res
        .status(400)
        .json({ success: false, message: "status is required" });
    }

    const payload = { status, admin_note, amount_collected };
    let result;

    // Try to run inside a transaction (requires a replica set). If the
    // server is a standalone instance (common in local dev), fall back to
    // non-transactional writes — still correct for single-server setups.
    try {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          result = await applyStatusUpdate(req.params.id, payload, session);
        });
      } finally {
        session.endSession();
      }
    } catch (txnErr) {
      // MongoServerError 20 / 263 = "Transaction numbers are only allowed
      // on a replica set member or mongos" — safe to retry without a
      // session on a standalone instance.
      if (
        txnErr.codeName === "IllegalOperation" ||
        txnErr.code === 20 ||
        txnErr.code === 263 ||
        /transaction/i.test(txnErr.message)
      ) {
        result = await applyStatusUpdate(req.params.id, payload, null);
      } else {
        throw txnErr;
      }
    }

    res.json({ success: true, data: result });
  } catch (err) {
    if (err.statusCode) {
      return res
        .status(err.statusCode)
        .json({ success: false, message: err.message });
    }
    next(err);
  }
};
