const Review = require('../models/Review');

// @desc    Create a review for a product
// @route   POST /api/products/:productId/reviews
const createReview = async (req, res, next) => {
  try {
    const { rating, comment } = req.body;
    const review = await Review.create({
      product: req.params.productId,
      user: req.user._id,
      rating,
      comment,
    });
    res.status(201).json({ success: true, data: review });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all reviews for a product, plus average rating
// @route   GET /api/products/:productId/reviews
const getReviewsForProduct = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const filter = { product: req.params.productId };

    const [items, total, ratingAgg] = await Promise.all([
      Review.find(filter).populate('user', 'name').sort('-created_at').skip(skip).limit(limit).lean(),
      Review.countDocuments(filter),
      Review.aggregate([
        { $match: { product: new (require('mongoose').Types.ObjectId)(req.params.productId), is_deleted: { $ne: true } } },
        { $group: { _id: '$product', averageRating: { $avg: '$rating' }, count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      success: true,
      data: items,
      summary: ratingAgg[0]
        ? { averageRating: Math.round(ratingAgg[0].averageRating * 10) / 10, count: ratingAgg[0].count }
        : { averageRating: 0, count: 0 },
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update own review
// @route   PUT /api/reviews/:id
const updateReview = async (req, res, next) => {
  try {
    const review = await Review.findOne({ _id: req.params.id, user: req.user._id });
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

    if (req.body.rating !== undefined) review.rating = req.body.rating;
    if (req.body.comment !== undefined) review.comment = req.body.comment;
    await review.save();

    res.json({ success: true, data: review });
  } catch (err) {
    next(err);
  }
};

// @desc    Soft delete own review (or any review, if admin)
// @route   DELETE /api/reviews/:id
const deleteReview = async (req, res, next) => {
  try {
    const filter =
      req.user.role === 'admin' ? { _id: req.params.id } : { _id: req.params.id, user: req.user._id };
    const review = await Review.findOne(filter);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

    await review.softDelete();
    res.json({ success: true, message: 'Review soft-deleted' });
  } catch (err) {
    next(err);
  }
};

module.exports = { createReview, getReviewsForProduct, updateReview, deleteReview };
