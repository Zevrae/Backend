const express = require('express');
const router = express.Router();
const {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} = require('../controllers/categoryController');
const { protect, authorize } = require('../middleware/auth');

router.route('/').get(getCategories).post(protect, authorize('admin'), createCategory);

router
  .route('/:id')
  .get(getCategoryById)
  .put(protect, authorize('admin'), updateCategory)
  .delete(protect, authorize('admin'), deleteCategory);

module.exports = router;
