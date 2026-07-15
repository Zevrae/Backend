import Razorpay from 'razorpay';
import crypto from 'crypto';

let instance;

// Lazily constructs the Razorpay client so the app can still boot (and other
// routes still work) even if payment env vars aren't set yet.
export function getRazorpay() {
  if (instance) return instance;

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay is not configured: set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET');
  }

  instance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  return instance;
}

export const isRazorpayConfigured = () =>
  Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

// Verifies the signature returned by Razorpay Checkout after a successful
// payment: HMAC-SHA256("order_id|payment_id", key_secret) === signature.
// (Razorpay's SDK only exposes `validateWebhookSignature` as a public static
// method — this check uses the same underlying formula directly.)
export const verifyPaymentSignature = ({ orderId, paymentId, signature }) => {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return expected === signature;
};

// Verifies the signature Razorpay sends on webhook requests:
// HMAC-SHA256(rawRequestBody, webhookSecret) === X-Razorpay-Signature header
export const verifyWebhookSignature = (rawBody, signature) =>
  Razorpay.validateWebhookSignature(rawBody, signature, process.env.RAZORPAY_WEBHOOK_SECRET);
