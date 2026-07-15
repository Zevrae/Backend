import Product from '../models/Product.js';
import {
  uploadFileToAppwrite,
  deleteFileFromAppwrite,
  extractFileIdFromUrl,
  isAppwriteConfigured,
} from '../utils/appwrite.js';

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
    if (req.query.collection) filter.collections = req.query.collection;
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

// @desc    Upload one or more images for a product to Appwrite Storage
// @route   POST /api/products/:id/images
export const uploadProductImages = async (req, res, next) => {
  try {
    if (!isAppwriteConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Image storage is not configured on the server (missing Appwrite env vars)',
      });
    }

    const product = await Product.findOne({ _id: req.params.id, is_deleted: { $ne: true } });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No image files provided (use the "images" field)' });
    }

    const uploadedUrls = [];
    for (const file of req.files) {
      const url = await uploadFileToAppwrite(file.buffer, file.originalname);
      uploadedUrls.push(url);
    }

    product.images.push(...uploadedUrls);
    await product.save();

    res.status(201).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

// @desc    Remove an image from a product (and delete it from Appwrite Storage)
// @route   DELETE /api/products/:id/images
export const deleteProductImage = async (req, res, next) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ success: false, message: 'imageUrl is required' });
    }

    const product = await Product.findOne({ _id: req.params.id, is_deleted: { $ne: true } });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const idx = product.images.indexOf(imageUrl);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Image not found on this product' });
    }

    const fileId = extractFileIdFromUrl(imageUrl);
    if (fileId && isAppwriteConfigured()) {
      try {
        await deleteFileFromAppwrite(fileId);
      } catch (e) {
        // File may already be gone from the bucket — don't block removing it from the product
      }
    }

    product.images.splice(idx, 1);
    await product.save();

    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};
