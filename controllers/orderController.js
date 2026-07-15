import Order from '../models/Order.js';
import Cart from '../models/Cart.js';
import { getRazorpay, isRazorpayConfigured } from '../utils/razorpay.js';

const SHIPPING_FEE = 0; // Assumption: flat/free shipping placeholder — wire up real logic as needed

// @desc    Place an order from the current cart, and open a Razorpay order for payment
// @route   POST /api/orders
export const createOrder = async (req, res, next) => {
  try {
    const { shipping_address } = req.body;
    if (!shipping_address) {
      return res.status(400).json({ success: false, message: 'Shipping address is required' });
    }

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    const subtotal = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const total = subtotal + SHIPPING_FEE;

    const order = await Order.create({
      user: req.user._id,
      items: cart.items.map((item) => ({
        product: item.product,
        name: item.name,
        price: item.price,
        size: item.size,
        quantity: item.quantity,
      })),
      shipping_address,
      subtotal,
      shipping_fee: SHIPPING_FEE,
      total,
    });

    // Empty the cart once the order record exists (payment is handled separately)
    cart.items = [];
    await cart.save();

    let razorpayOrder = null;
    if (isRazorpayConfigured()) {
      const rp = getRazorpay();
      // Amount is in the smallest currency unit (paise for INR), matching
      // how `price`/`total` are already stored on Product/Order.
      razorpayOrder = await rp.orders.create({
        amount: total,
        currency: process.env.RAZORPAY_CURRENCY || 'INR',
        receipt: order._id.toString(),
        notes: { orderId: order._id.toString(), userId: req.user._id.toString() },
      });

      order.razorpay_order_id = razorpayOrder.id;
      await order.save();
    }

    res.status(201).json({
      success: true,
      data: order,
      payment: razorpayOrder
        ? {
            provider: 'razorpay',
            key_id: process.env.RAZORPAY_KEY_ID,
            order_id: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
          }
        : null,
      message: razorpayOrder
        ? 'Order created — use the payment details to open Razorpay Checkout, then call POST /api/payments/verify.'
        : 'Order created. Payment gateway is not configured on the server.',
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

    const filter = req.user.role === 'admin' ? {} : { user: req.user._id };
    if (req.query.order_status) filter.order_status = req.query.order_status;
    if (req.query.payment_status) filter.payment_status = req.query.payment_status;

    const [items, total] = await Promise.all([
      Order.find(filter).sort('-created_at').skip(skip).limit(limit).lean(),
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
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (req.user.role !== 'admin' && order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    res.json({ success: true, data: order });
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
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};
