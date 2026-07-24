import User from "../models/User.js";
import generateToken from "../utils/generateToken.js";
import { hashToken } from "../utils/tokens.js";
import { sendEmail } from "../utils/sendEmail.js";

const buildVerificationUrl = (rawToken) => {
  const base = process.env.API_BASE_URL;
  return `${base}/api/auth/verify-email/${rawToken}`;
};

const sendVerificationEmail = async (user, rawToken) => {
  const url = buildVerificationUrl(rawToken);
  await sendEmail({
    to: user.email,
    subject: "Verify your Zevrae account",
    html: `
      <p>Hi ${user.name},</p>
      <p>Please verify your email address to activate your Zevrae account:</p>
      <p><a href="${url}">${url}</a></p>
      <p>This link expires in ${process.env.EMAIL_VERIFICATION_EXPIRES_HOURS || 24} hours.</p>
    `,
  });
};

// @desc    Register a new user (unverified until they click the emailed link)
// @route   POST /api/auth/register
export const register = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;

    const existing = await User.findOne({ email: email?.toLowerCase() });
    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: "Email is already registered" });
    }

    const user = await User.create({ name, email, password, phone });

    const rawToken = user.generateEmailVerificationToken();
    await user.save({ validateBeforeSave: false });
    await sendVerificationEmail(user, rawToken);

    res.status(201).json({
      success: true,
      message:
        "Registration successful. Please check your email to verify your account before logging in.",
      data: user.toSafeObject(),
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Verify an email address using the token from the verification email
// @route   GET /api/auth/verify-email/:token
export const verifyEmail = async (req, res, next) => {
  try {
    const hashed = hashToken(req.params.token);

    const user = await User.findOne({
      email_verification_token: hashed,
      email_verification_expires: { $gt: new Date() },
    }).select("+email_verification_token +email_verification_expires");

    if (!user) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Verification link is invalid or has expired",
        });
    }

    user.is_email_verified = true;
    user.email_verification_token = undefined;
    user.email_verification_expires = undefined;
    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message: "Email verified successfully. You can now log in.",
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Resend the verification email
// @route   POST /api/auth/resend-verification
export const resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    // Respond the same way whether or not the account exists, to avoid
    // leaking which emails are registered.
    const genericResponse = {
      success: true,
      message:
        "If that email is registered and unverified, a new verification link has been sent.",
    };

    if (!user || user.is_email_verified) {
      return res.json(genericResponse);
    }

    const rawToken = user.generateEmailVerificationToken();
    await user.save({ validateBeforeSave: false });
    await sendVerificationEmail(user, rawToken);

    res.json(genericResponse);
  } catch (err) {
    next(err);
  }
};

// @desc    Login
// @route   POST /api/auth/login
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+password",
    );
    if (!user || !(await user.comparePassword(password))) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }
    if (!user.is_active) {
      return res
        .status(403)
        .json({ success: false, message: "Account is deactivated" });
    }
    if (!user.is_email_verified) {
      return res.status(403).json({
        success: false,
        message:
          "Please verify your email before logging in. Use /api/auth/resend-verification if you need a new link.",
      });
    }

    const token = generateToken(user._id);
    res.json({ success: true, token, data: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
};

// @desc    Get currently authenticated user
// @route   GET /api/auth/me
export const getMe = async (req, res, next) => {
  try {
    res.json({ success: true, data: req.user.toSafeObject() });
  } catch (err) {
    next(err);
  }
};
