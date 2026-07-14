const User = require('../models/User');

// @desc    Update own profile
// @route   PUT /api/users/me
const updateMe = async (req, res, next) => {
  try {
    const allowedFields = ['name', 'phone', 'addresses'];
    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });
    res.json({ success: true, data: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
};

// @desc    List all users (admin only)
// @route   GET /api/users
const getUsers = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.role) filter.role = req.query.role;

    const [items, total] = await Promise.all([
      User.find(filter).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get a single user by id (admin only)
// @route   GET /api/users/:id
const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

// @desc    Soft delete a user (admin only)
// @route   DELETE /api/users/:id
const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    await user.softDelete();
    res.json({ success: true, message: 'User soft-deleted' });
  } catch (err) {
    next(err);
  }
};

module.exports = { updateMe, getUsers, getUserById, deleteUser };
