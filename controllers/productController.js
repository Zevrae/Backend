import Product from '../models/Product.js';

// @desc    Create a product
// @route   POST /api/products
export const createProduct = async (req, res, next) => {
  try {
    const product = await Product.create(req.body);
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all products (paginated, filterable, searchable)
// @route   GET /api/products
// Query params: page, limit, category, subcategory, status, search, sort
export const getProducts = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.subcategory) filter.subcategory = req.query.subcategory;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) filter.$text = { $search: req.query.search };

    const sort = req.query.sort ? req.query.sort.split(',').join(' ') : '-created_at';

    const [items, total] = await Promise.all([
      Product.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get a single product by id
// @route   GET /api/products/:id
export const getProductById = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

// @desc    Update a product
// @route   PUT /api/products/:id
export const updateProduct = async (req, res, next) => {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, is_deleted: { $ne: true } },
      req.body,
      { new: true, runValidators: true, context: 'query' }
    );
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

// @desc    Soft delete a product
// @route   DELETE /api/products/:id
export const deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, is_deleted: { $ne: true } });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    await product.softDelete();
    res.json({ success: true, message: 'Product soft-deleted', data: product });
  } catch (err) {
    next(err);
  }
};

// @desc    Restore a soft-deleted product
// @route   PATCH /api/products/:id/restore
export const restoreProduct = async (req, res, next) => {
  try {
    const product = await Product.findOne({ _id: req.params.id }).setOptions({ withDeleted: true });
    if (!product || !product.is_deleted) {
      return res.status(404).json({ success: false, message: 'Deleted product not found' });
    }
    await product.restore();
    res.json({ success: true, message: 'Product restored', data: product });
  } catch (err) {
    next(err);
  }
};
