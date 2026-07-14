const User = require('../models/User');
const generateToken = require('../utils/generateToken');

// @desc    Register a new user
// @route   POST /api/auth/register
const register = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;

    const existing = await User.findOne({ email: email?.toLowerCase() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email is already registered' });
    }

    const user = await User.create({ name, email, password, phone });
    const token = generateToken(user._id);

    res.status(201).json({ success: true, token, data: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
};

// @desc    Login
// @route   POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }

    const token = generateToken(user._id);
    res.json({ success: true, token, data: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
};

// @desc    Get currently authenticated user
// @route   GET /api/auth/me
const getMe = async (req, res, next) => {
  try {
    res.json({ success: true, data: req.user.toSafeObject() });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, getMe };
