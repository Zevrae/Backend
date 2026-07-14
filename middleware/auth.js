import jwt from "jsonwebtoken";
import User from "../models/User.js";

// Verifies the JWT and attaches req.user
export const protect = async (req, res, next) => {
  try {
    let token;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "Not authorized, no token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || !user.is_active) {
      return res
        .status(401)
        .json({
          success: false,
          message: "Not authorized, user not found or inactive",
        });
    }

    req.user = user;
    next();
  } catch (err) {
    return res
      .status(401)
      .json({
        success: false,
        message: "Not authorized, invalid or expired token",
      });
  }
};

// Restricts access to specific roles, e.g. authorize('admin')
export const authorize =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({
          success: false,
          message: "Forbidden: insufficient permissions",
        });
    }
    next();
  };
