import express from "express";
import {
  register,
  login,
  googleLogin,
  getMe,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
} from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";
//import { loginLimiter, registerLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Registration, email verification, login, and current-user info
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user (account starts unverified)
 *     description: Creates the account and emails a verification link. The user cannot log in until they verify their email.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterInput'
 *     responses:
 *       201:
 *         description: Registered — verification email sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string }
 *                 data: { $ref: '#/components/schemas/User' }
 *       409:
 *         description: Email already registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/register", register);

/**
 * @swagger
 * /auth/verify-email/{token}:
 *   get:
 *     summary: Verify an email address using the token from the verification email
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *         description: The raw token from the verification link (not stored in the DB directly — it's hashed for comparison)
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Token is invalid or expired
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/verify-email/:token", verifyEmail);

/**
 * @swagger
 * /auth/resend-verification:
 *   post:
 *     summary: Resend the email verification link
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: >
 *           A generic success message is always returned (whether or not the
 *           email is registered/already verified) to avoid leaking account existence.
 */
router.post("/resend-verification", resendVerification);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: >
 *           A generic success message is always returned (whether or not the
 *           email is registered) to avoid leaking account existence.
 */
router.post("/forgot-password", forgotPassword);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password using the token from the reset email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token: { type: string }
 *               password: { type: string, format: password }
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Token invalid/expired, or password fails validation
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/reset-password", resetPassword);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Log in and receive a JWT
 *     description: Fails with 403 if the account's email has not been verified yet.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginInput'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Email not verified, or account deactivated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/login", login);

/**
 * @swagger
 * /auth/google:
 *   post:
 *     summary: Sign in (or register, on first use) with a Google ID token
 *     description: >
 *       Verifies the Google ID token (the `credential` returned by Google
 *       Identity Services on the frontend) server-side against Google's
 *       public keys. If an account already exists with the same email, it's
 *       linked to this Google account rather than creating a duplicate. New
 *       accounts are created pre-verified (Google already confirmed the
 *       email) and have no password.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [credential]
 *             properties:
 *               credential: { type: string, description: "The Google ID token (JWT) from Google Identity Services" }
 *     responses:
 *       200:
 *         description: Signed in — same shape as POST /auth/login
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 token: { type: string }
 *                 data: { $ref: '#/components/schemas/User' }
 *       400:
 *         description: Missing credential
 *       401:
 *         description: Invalid/expired credential, or Google email not verified
 *       403:
 *         description: Account is deactivated
 *       503:
 *         description: Google sign-in is not configured on the server (missing GOOGLE_CLIENT_ID)
 */
router.post("/google", googleLogin);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get the currently authenticated user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/User' }
 *       401:
 *         description: Not authorized
 */
router.get("/me", protect, getMe);

export default router;
