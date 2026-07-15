import Analysis from '../models/Analysis.js';
import Product from '../models/Product.js';

// @desc    List demand-counter analytics for all products (admin only)
// @route   GET /api/analysis
export const getAnalysis = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Analysis.find()
        .populate('productId', 'name category subcategory status')
        .sort('-demandCounter')
        .skip(skip)
        .limit(limit)
        .lean(),
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
