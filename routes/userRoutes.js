const express = require('express');
const router = express.Router();
const { updateMe, getUsers, getUserById, deleteUser } = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');

router.put('/me', protect, updateMe);

router.get('/', protect, authorize('admin'), getUsers);
router.get('/:id', protect, authorize('admin'), getUserById);
router.delete('/:id', protect, authorize('admin'), deleteUser);

module.exports = router;
