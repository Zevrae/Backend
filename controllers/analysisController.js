import Analysis from '../models/Analysis.js';
import Product from '../models/Product.js';

// @desc    List demand-counter analytics for all products (admin only)
// @route   GET /api/analysis
export const getAnalysis = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;
    // 'demand' = units actually ordered, 'notify' = out-of-stock interest,
    // 'combined' = both added together (a rough overall "how much people
    // want this" score).
    const sortField = { demand: '-demandCounter', notify: '-notifyCounter', combined: '-combinedScore' }[req.query.sortBy] || '-demandCounter';

    const [items, total] = await Promise.all([
      Analysis.aggregate([
        { $addFields: { combinedScore: { $add: ['$demandCounter', '$notifyCounter'] } } },
        { $sort: { [sortField.replace('-', '')]: sortField.startsWith('-') ? -1 : 1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: 'products',
            localField: 'productId',
            foreignField: '_id',
            as: 'product',
          },
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            demandCounter: 1,
            notifyCounter: 1,
            combinedScore: 1,
            created_at: 1,
            updated_at: 1,
            'product._id': 1,
            'product.name': 1,
            'product.category': 1,
            'product.subcategory': 1,
            'product.status': 1,
            'product.stock_quantity': 1,
            'product.images': 1,
          },
        },
      ]),
      Analysis.countDocuments(),
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

// @desc    Category-level demand breakdown plus the highest-value insight for
//          restocking decisions: products people actively want but can't
//          currently buy (high notify signups, zero stock right now).
// @route   GET /api/analysis/summary
export const getAnalysisSummary = async (req, res, next) => {
  try {
    const [byCategory, topOverall, unfulfilledDemand] = await Promise.all([
      // Demand summed per category — "which categories matter most"
      Analysis.aggregate([
        {
          $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' },
        },
        { $unwind: '$product' },
        { $match: { 'product.is_deleted': { $ne: true } } },
        {
          $group: {
            _id: '$product.category',
            totalDemand: { $sum: '$demandCounter' },
            totalNotify: { $sum: '$notifyCounter' },
            productCount: { $sum: 1 },
          },
        },
        { $addFields: { combinedScore: { $add: ['$totalDemand', '$totalNotify'] } } },
        { $sort: { combinedScore: -1 } },
      ]),

      // Top 10 products overall, by combined demand — "what's hottest right now"
      Analysis.aggregate([
        { $addFields: { combinedScore: { $add: ['$demandCounter', '$notifyCounter'] } } },
        { $sort: { combinedScore: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { $match: { 'product.is_deleted': { $ne: true } } },
        {
          $project: {
            demandCounter: 1,
            notifyCounter: 1,
            combinedScore: 1,
            'product._id': 1,
            'product.name': 1,
            'product.category': 1,
            'product.subcategory': 1,
            'product.stock_quantity': 1,
            'product.images': 1,
          },
        },
      ]),

      // The single most actionable list for an inventory manager: real
      // demand (notify signups) going completely unfulfilled right now.
      Analysis.aggregate([
        { $match: { notifyCounter: { $gt: 0 } } },
        { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { $match: { 'product.is_deleted': { $ne: true }, 'product.stock_quantity': { $lte: 0 } } },
        { $sort: { notifyCounter: -1 } },
        { $limit: 20 },
        {
          $project: {
            demandCounter: 1,
            notifyCounter: 1,
            'product._id': 1,
            'product.name': 1,
            'product.category': 1,
            'product.subcategory': 1,
            'product.stock_quantity': 1,
            'product.images': 1,
          },
        },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        byCategory,
        topOverall,
        unfulfilledDemand,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Manually adjust a product's demand counter (admin only). In normal
//          operation the counter is incremented automatically at checkout
//          (see orderController.createOrder) — this exists for admin
//          corrections/testing.
// @route   PUT /api/analysis
export const updateAnalysis = async (req, res, next) => {
  try {
    const { productId, incrementBy = 1 } = req.body;
    if (!productId) {
      return res.status(400).json({ success: false, message: 'productId is required' });
    }

    const product = await Product.findById(productId).lean();
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Upsert on the `productId` FIELD (not the Analysis document's own _id —
    // those are two different ids and were being conflated here before).
    const analysis = await Analysis.findOneAndUpdate(
      { productId },
      { $inc: { demandCounter: incrementBy } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, data: analysis });
  } catch (err) {
    next(err);
  }
};
