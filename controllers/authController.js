import User from "../models/User.js";
import generateToken from "../utils/generateToken.js";
import { hashToken } from "../utils/tokens.js";
import { sendEmail } from "../utils/sendEmail.js";
import { OAuth2Client } from "google-auth-library";

const googleClient = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;

if (!process.env.GOOGLE_CLIENT_ID) {
  console.warn(
    "[auth] GOOGLE_CLIENT_ID is not set — POST /api/auth/google will return 503 until it is configured.",
  );
} else {
  console.log(
    `[auth] Google sign-in configured for client ID ending in …${process.env.GOOGLE_CLIENT_ID.slice(-12)}`,
  );
}

const buildVerificationUrl = (rawToken) => {
  const base = process.env.API_BASE_URL;
  return `${base}/api/auth/verify-email/${rawToken}`;
};

const sendVerificationEmail = async (user, rawToken) => {
  const url = buildVerificationUrl(rawToken);
  const expiresIn = process.env.EMAIL_VERIFICATION_EXPIRES_HOURS || 24;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Verify Your Zevrae Account</title>
      <style>
        body {
          font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background-color: #f5f7fa;
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 600px;
          margin: 40px auto;
          background-color: #ffffff;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        .header {
          background-color: #c5a059;
          color: #ffffff;
          text-align: center;
          padding: 20px;
          font-size: 22px;
          font-weight: 600;
          letter-spacing: 1px;
        }
        .content {
          padding: 30px;
          color: #333333;
          line-height: 1.6;
        }
        .button {
          display: inline-block;
          background-color: #c5a059;
          color: #ffffff !important;
          text-decoration: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-weight: 500;
          margin-top: 20px;
        }
        .footer {
          text-align: center;
          font-size: 12px;
          color: #777777;
          padding: 20px;
          background-color: #f5f7fa;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">ZEVRAE</div>
        <div class="content">
          <p>Hi <strong>${user.name}</strong>,</p>
          <p>Welcome to <strong>Zevrae</strong> — Luxury is a matter of choice. Please verify your email address to activate your account.</p>
          <p style="text-align:center;">
            <a href="${url}" class="button">Verify My Email</a>
          </p>
          <p>This link will expire in <strong>${expiresIn} hours</strong>. If you didn’t create an account, you can safely ignore this message.</p>
          <p>Thanks,<br/>The Zevrae Team</p>
        </div>
        <div class="footer">
          © ${new Date().getFullYear()} Zevrae. All rights reserved.<br/>
          officialzevrae@gmail.com
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: user.email,
    subject: "Verify your Zevrae account",
    html,
  });
};

const buildPasswordResetUrl = (rawToken) => {
  const base = process.env.API_BASE_URL;
  return `${base}/api/auth/reset-password/${rawToken}`;
};

const sendPasswordResetEmail = async (user, rawToken) => {
  const url = buildPasswordResetUrl(rawToken);
  const expiresIn = process.env.PASSWORD_RESET_EXPIRES_HOURS || 1;

  const html = `
    <!DOCTYPE html>
    <html><body>
      <p>Hi ${user.name},</p>
      <p>We received a request to reset your Zevrae password. Click below to choose a new one:</p>
      <p><a href="${url}">Reset My Password</a></p>
      <p>This link expires in ${expiresIn} hour(s). If you didn't request this, you can safely ignore this email — your password won't be changed.</p>
    </body></html>
  `;

  await sendEmail({
    to: user.email,
    subject: "Reset your Zevrae password",
    html,
  });
};
const validatePassword = (password) => {
  const errors = [];

  if (password.length < 8)
    errors.push("Password must be at least 8 characters");
  if (!/[A-Z]/.test(password))
    errors.push("Password must contain at least one uppercase letter");
  if (!/[a-z]/.test(password))
    errors.push("Password must contain at least one lowercase letter");
  if (!/[0-9]/.test(password))
    errors.push("Password must contain at least one number");

  const commonPasswords = [
    "password",
    "12345678",
    "123456789",
    "qwerty123",
    "abc12345",
    "password1",
    "iloveyou",
    "11111111",
    "00000000",
    "admin123",
  ];
  if (commonPasswords.includes(password.toLowerCase()))
    errors.push(
      "This password is too common. Please choose a stronger password",
    );

  return errors;
};

export const register = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;

    const existing = await User.findOne({ email: email?.toLowerCase() });
    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: "Email is already registered" });
    }

    const passwordErrors = validatePassword(password || "");
    if (passwordErrors.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: passwordErrors[0] });
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

export const verifyEmail = async (req, res, next) => {
  try {
    const hashed = hashToken(req.params.token);

    const user = await User.findOne({
      email_verification_token: hashed,
      email_verification_expires: { $gt: new Date() },
    }).select("+email_verification_token +email_verification_expires");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Verification link is invalid or has expired",
      });
    }

    user.is_email_verified = true;
    user.email_verification_token = undefined;
    user.email_verification_expires = undefined;
    await user.save({ validateBeforeSave: false });

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Email Verified - Zevrae</title>
        <style>
          body {
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #f5f7fa;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            overflow: hidden;
          }
          .header {
            background-color: #c5a059;
            color: #ffffff;
            text-align: center;
            padding: 20px;
            font-size: 22px;
            font-weight: 600;
            letter-spacing: 1px;
          }
          .content {
            padding: 30px;
            color: #333333;
            line-height: 1.6;
            text-align: center;
          }
          .button {
            display: inline-block;
            background-color: #c5a059;
            color: #ffffff !important;
            text-decoration: none;
            padding: 12px 24px;
            border-radius: 6px;
            font-weight: 500;
            margin-top: 20px;
          }
          .footer {
            text-align: center;
            font-size: 12px;
            color: #777777;
            padding: 20px;
            background-color: #f5f7fa;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">ZEVRAE</div>
          <div class="content">
            <h2>Email Verified Successfully!</h2>
            <p>Thank you for verifying your email address. You can now log in to your Zevrae account.</p>
            <a href="https://www.zevrae.com" class="button">Go to Login</a>
          </div>
          <div class="footer">
            © ${new Date().getFullYear()} Zevrae. All rights reserved.<br/> 
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    next(err);
  }
};

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

// @desc    Sign in (or register, on first use) with a Google ID token
// @route   POST /api/auth/google
export const googleLogin = async (req, res, next) => {
  try {
    if (!googleClient) {
      return res.status(503).json({
        success: false,
        message:
          "Google sign-in is not configured on the server (missing GOOGLE_CLIENT_ID)",
      });
    }

    const { credential } = req.body;
    if (!credential) {
      return res
        .status(400)
        .json({ success: false, message: "Google credential is required" });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (err) {
      // Log the real reason server-side. Do NOT put err.message in the
      // response — it can leak config details — but this is the single
      // most useful line for diagnosing Google sign-in failures, since
      // "Invalid or expired" below is returned for several different
      // underlying causes (actually expired token, clock skew, and most
      // commonly: audience/client-ID mismatch between frontend and backend).
      console.error("[auth] Google verifyIdToken failed:", err.message);

      if (
        err.message?.includes("Wrong recipient") ||
        err.message?.includes("audience")
      ) {
        console.error(
          "[auth] This looks like a client ID mismatch: the token's audience doesn't match " +
            "process.env.GOOGLE_CLIENT_ID on this server. Confirm it's identical to the " +
            "VITE_GOOGLE_CLIENT_ID used to build the frontend, with no extra whitespace.",
        );
      }

      return res.status(401).json({
        success: false,
        message: "Invalid or expired Google credential",
      });
    }

    if (!payload?.email) {
      return res.status(401).json({
        success: false,
        message: "Google account has no email on file",
      });
    }
    if (payload.email_verified === false) {
      return res
        .status(401)
        .json({ success: false, message: "Google email is not verified" });
    }

    const email = payload.email.toLowerCase();
    let user = await User.findOne({ google_id: payload.sub });

    if (!user) {
      user = await User.findOne({ email });
      if (user) {
        user.google_id = payload.sub;
        user.is_email_verified = true;
        await user.save({ validateBeforeSave: false });
      } else {
        user = await User.create({
          name: payload.name || email.split("@")[0],
          email,
          google_id: payload.sub,
          auth_provider: "google",
          is_email_verified: true,
        });
      }
    }

    if (!user.is_active) {
      return res
        .status(403)
        .json({ success: false, message: "Account is deactivated" });
    }

    const token = generateToken(user._id);
    res.json({ success: true, token, data: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
};
// @desc    Request a password reset email
// @route   POST /api/auth/forgot-password
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    // Same response whether or not the account exists — avoids leaking
    // which emails are registered (email enumeration).
    const genericResponse = {
      success: true,
      message:
        "If that email is registered, a password reset link has been sent.",
    };

    if (!user || user.auth_provider !== "local") {
      // Google-only accounts have no password to reset — still return the
      // generic response so this endpoint can't be used to distinguish
      // auth_provider either.
      return res.json(genericResponse);
    }

    const rawToken = user.generatePasswordResetToken();
    await user.save({ validateBeforeSave: false });
    await sendPasswordResetEmail(user, rawToken);

    res.json(genericResponse);
  } catch (err) {
    next(err);
  }
};

// @desc    Reset password using the token from the reset email
// @route   POST /api/auth/reset-password
export const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res
        .status(400)
        .json({ success: false, message: "token and password are required" });
    }

    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: passwordErrors[0] });
    }

    const hashed = hashToken(token);
    const user = await User.findOne({
      password_reset_token: hashed,
      password_reset_expires: { $gt: new Date() },
    }).select("+password_reset_token +password_reset_expires");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Reset link is invalid or has expired",
      });
    }

    user.password = password; // pre('save') hook re-hashes this automatically
    user.password_reset_token = undefined;
    user.password_reset_expires = undefined;
    await user.save();

    res.json({
      success: true,
      message: "Password has been reset. You can now log in.",
    });
  } catch (err) {
    next(err);
  }
};
