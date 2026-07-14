const express = require('express');
const router = express.Router();
const {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
} = require('../controllers/orderController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/').get(getOrders).post(createOrder);
router.get('/:id', getOrderById);
router.patch('/:id/status', authorize('admin'), updateOrderStatus);

module.exports = router;
