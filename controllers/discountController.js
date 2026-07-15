import Discount from '../models/Discount.js';
import { applyDiscountCode, DiscountError } from '../utils/discounts.js';

// @desc    Create a new discount (admin only)
// @route   POST /api/discounts
export const createDiscount = async (req, res, next) => {
  try {
    const { code, type, value, usage, expiry, status } = req.body;
    const discount = await Discount.create({ code, type, value, usage, expiry, status });
    res.status(201).json({ success: true, data: discount });
  } catch (err) {
    next(err);
  }
};

// @desc    List all discounts (admin only)
// @route   GET /api/discounts
export const getDiscounts = async (req, res, next) => {
  try {
    const discounts = await Discount.find().sort('-created_at').lean();
    res.json({ success: true, data: discounts });
  } catch (err) {
    next(err);
  }
};

// @desc    Get a discount by code (public — lets the cart preview a code before checkout)
// @route   GET /api/discounts/:code
export const getDiscountByCode = async (req, res, next) => {
  try {
    const discount = await Discount.findOne({ code: req.params.code.toUpperCase() }).lean();
    if (!discount) {
      return res.status(404).json({ success: false, message: 'Discount not found' });
    }
    res.json({ success: true, data: discount });
  } catch (err) {
    next(err);
  }
};

// @desc    Validate a discount code against a subtotal and (if valid) consume one use.
//          Checkout (orderController.createOrder) runs the exact same logic via
//          utils/discounts.js so the two can't drift out of sync.
// @route   POST /api/discounts/use
export const useDiscount = async (req, res, next) => {
  try {
    const { code, subtotal } = req.body;
    if (typeof subtotal !== 'number') {
      return res.status(400).json({ success: false, message: 'subtotal (a number) is required' });
    }

    const { discount, discountAmount } = await applyDiscountCode(code, subtotal);
    res.json({ success: true, data: discount, discountAmount });
  } catch (err) {
    if (err instanceof DiscountError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    next(err);
  }
};

// @desc    Update a discount (admin only)
// @route   PUT /api/discounts/:id
export const updateDiscount = async (req, res, next) => {
  try {
    const discount = await Discount.findOneAndUpdate(
      { _id: req.params.id, is_deleted: { $ne: true } },
      req.body,
      { new: true, runValidators: true }
    );
    if (!discount) {
      return res.status(404).json({ success: false, message: 'Discount not found' });
    }
    res.json({ success: true, data: discount });
  } catch (err) {
    next(err);
  }
};

// @desc    Soft delete a discount (admin only)
// @route   DELETE /api/discounts/:id
export const deleteDiscount = async (req, res, next) => {
  try {
    const discount = await Discount.findOne({ _id: req.params.id, is_deleted: { $ne: true } });
    if (!discount) {
      return res.status(404).json({ success: false, message: 'Discount not found' });
    }
    await discount.softDelete();
    res.json({ success: true, message: 'Discount soft-deleted' });
  } catch (err) {
    next(err);
  }
};
