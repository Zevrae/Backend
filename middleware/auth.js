import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Verifies the JWT and attaches req.user
export const protect = async (req, res, next) => {
  try {
    let token;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized, no token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: 'Not authorized, user not found or inactive' });
    }
    if (!user.is_email_verified) {
      return res.status(403).json({ success: false, message: 'Please verify your email to access this resource' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Not authorized, invalid or expired token' });
  }
};

// Same as protect, but never rejects — attaches req.user if a valid token
// is present, otherwise just calls next() with req.user left unset. For
// endpoints that should work for guests but still recognize logged-in users
// (e.g. "notify me" signups, so we can auto-fill/link the requester's
// account without requiring them to be logged in).
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (user && user.is_active) {
      req.user = user;
    }
  } catch {
    // Invalid/expired token on an optional-auth route just means "treat as
    // a guest" — not an error worth surfacing here.
  }
  next();
};

// Restricts access to specific roles, e.g. authorize('admin')
export const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Forbidden: insufficient permissions' });
  }
  next();
};
