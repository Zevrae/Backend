import Cart, { MAX_QTY_PER_SIZE } from '../models/Cart.js';
import Product from '../models/Product.js';

// Helper: get or create the current user's cart
const getOrCreateCart = async (userId) => {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = await Cart.create({ user: userId, items: [] });
  }
  return cart;
};

// @desc    Get the current user's cart
// @route   GET /api/cart
export const getCart = async (req, res, next) => {
  try {
    const cart = await getOrCreateCart(req.user._id);
    res.json({ success: true, data: cart });
  } catch (err) {
    next(err);
  }
};

// @desc    Add an item to the cart (or increment quantity if it already exists)
// @route   POST /api/cart/items
export const addItem = async (req, res, next) => {
  try {
    const { productId, size, quantity = 1 } = req.body;

    const product = await Product.findById(productId);
    if (!product || product.status !== 'active') {
      return res.status(404).json({ success: false, message: 'Product not available' });
    }

    const cart = await getOrCreateCart(req.user._id);
    const existing = cart.items.find(
      (item) => item.product.toString() === productId && item.size === size
    );

    const currentQty = existing ? existing.quantity : 0;
    if (currentQty + quantity > MAX_QTY_PER_SIZE) {
      return res.status(400).json({
        success: false,
        message:
          currentQty >= MAX_QTY_PER_SIZE
            ? `You already have the maximum of ${MAX_QTY_PER_SIZE} for this size in your bag.`
            : `You can only order up to ${MAX_QTY_PER_SIZE} of this size per product. You can add ${MAX_QTY_PER_SIZE - currentQty} more.`,
      });
    }

    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.items.push({
        product: product._id,
        name: product.name,
        price: product.price,
        size,
        quantity,
      });
    }

    await cart.save();
    res.status(201).json({ success: true, data: cart });
  } catch (err) {
    next(err);
  }
};

// @desc    Update the quantity of a cart item
// @route   PUT /api/cart/items/:itemId
export const updateItem = async (req, res, next) => {
  try {
    const { quantity } = req.body;
    if (!quantity || quantity < 1) {
      return res.status(400).json({ success: false, message: 'Quantity must be at least 1' });
    }
    if (quantity > MAX_QTY_PER_SIZE) {
      return res.status(400).json({
        success: false,
        message: `You can only order up to ${MAX_QTY_PER_SIZE} of this size per product.`,
      });
    }

    const cart = await getOrCreateCart(req.user._id);
    const item = cart.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Cart item not found' });

    item.quantity = quantity;
    await cart.save();
    res.json({ success: true, data: cart });
  } catch (err) {
    next(err);
  }
};

// @desc    Remove an item from the cart
// @route   DELETE /api/cart/items/:itemId
export const removeItem = async (req, res, next) => {
  try {
    const cart = await getOrCreateCart(req.user._id);
    const item = cart.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Cart item not found' });

    item.deleteOne();
    await cart.save();
    res.json({ success: true, data: cart });
  } catch (err) {
    next(err);
  }
};

// @desc    Clear the cart
// @route   DELETE /api/cart
export const clearCart = async (req, res, next) => {
  try {
    const cart = await getOrCreateCart(req.user._id);
    cart.items = [];
    await cart.save();
    res.json({ success: true, data: cart });
  } catch (err) {
    next(err);
  }
};
