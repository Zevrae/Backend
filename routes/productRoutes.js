const express = require('express');
const router = express.Router();
const {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  restoreProduct,
} = require('../controllers/productController');
const reviewRoutes = require('./reviewRoutes');
const { protect, authorize } = require('../middleware/auth');

router.route('/').get(getProducts).post(protect, authorize('admin'), createProduct);

router
  .route('/:id')
  .get(getProductById)
  .put(protect, authorize('admin'), updateProduct)
  .delete(protect, authorize('admin'), deleteProduct);

router.patch('/:id/restore', protect, authorize('admin'), restoreProduct);

// Nested: /api/products/:productId/reviews
router.use('/:productId/reviews', reviewRoutes);

module.exports = router;
