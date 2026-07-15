import Discount from '../models/Discount.js';

export class DiscountError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Validates a discount code against a subtotal and, if valid, consumes one
 * use (increments usage.used and persists it). Used by both the standalone
 * POST /api/discounts/use endpoint and checkout (orderController.createOrder)
 * so the two can never drift out of sync.
 *
 * @returns {Promise<{ discount: import('mongoose').Document, discountAmount: number }>}
 * @throws {DiscountError} with an appropriate HTTP status code on failure
 */
export const applyDiscountCode = async (code, subtotal) => {
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

  discount.usage.used += 1;
  await discount.save();

  return { discount, discountAmount };
};
