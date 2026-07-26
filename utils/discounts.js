import Discount from '../models/Discount.js';

export class DiscountError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Validates a discount code against a subtotal and, if `consume` is true
 * (the default), persists one use (increments usage.used). Checkout
 * (orderController.createOrder) calls this with consume:true at the moment
 * an order is actually placed — that's the only place a use should ever be
 * spent. The "Apply coupon" step in the UI should call this with
 * consume:false first, purely to validate + preview the discount amount,
 * so an abandoned cart or a user who never finishes checkout doesn't burn
 * a redemption for nothing.
 *
 * @returns {Promise<{ discount: import('mongoose').Document, discountAmount: number }>}
 * @throws {DiscountError} with an appropriate HTTP status code on failure
 */
export const applyDiscountCode = async (code, subtotal, { consume = true } = {}) => {
  if (!code) throw new DiscountError('Discount code is required', 400);

  const discount = await Discount.findOne({ code: code.toUpperCase() });
  if (!discount) throw new DiscountError('Discount not found', 404);

  // Auto-flip stale "Active" codes that have simply passed their expiry date
  if (discount.status === 'Active' && discount.expiry <= new Date()) {
    discount.status = 'Expired';
    await discount.save();
  }

  if (!discount.isRedeemable()) {
    const message =
      discount.status !== 'Active'
        ? 'This discount code is no longer active'
        : discount.usage.used >= discount.usage.limit
          ? 'This discount code has reached its usage limit'
          : 'This discount code has expired';
    throw new DiscountError(message, 400);
  }

  const discountAmount = discount.calculateDiscountAmount(subtotal);

  if (consume) {
    discount.usage.used += 1;
    await discount.save();
  }

  return { discount, discountAmount };
};
