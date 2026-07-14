const express = require('express');
// mergeParams lets this router read :productId when mounted inside productRoutes
const router = express.Router({ mergeParams: true });
const {
  createReview,
  getReviewsForProduct,
  updateReview,
  deleteReview,
} = require('../controllers/reviewController');
const { protect } = require('../middleware/auth');

// Mounted at /api/products/:productId/reviews
router.route('/').get(getReviewsForProduct).post(protect, createReview);

module.exports = router;

// Standalone router for /api/reviews/:id (update/delete by review id)
const standaloneRouter = express.Router();
standaloneRouter.put('/:id', protect, updateReview);
standaloneRouter.delete('/:id', protect, deleteReview);

module.exports.standaloneRouter = standaloneRouter;
