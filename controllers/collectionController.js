import Collection from '../models/Collection.js';

const slugify = (str) =>
  str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// @desc    Create a collection (admin only)
// @route   POST /api/collections
export const createCollection = async (req, res, next) => {
  try {
    const { name, description, status, featured } = req.body;
    const collection = await Collection.create({
      name,
      slug: slugify(name),
      description,
      status,
      featured,
    });
    res.status(201).json({ success: true, data: collection });
  } catch (err) {
    next(err);
  }
};

// @desc    List collections
// @route   GET /api/collections
export const getCollections = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.featured !== undefined) filter.featured = req.query.featured === 'true';

    const collections = await Collection.find(filter).sort('-created_at').lean();
    res.json({ success: true, data: collections });
  } catch (err) {
    next(err);
  }
};

// @desc    Get a single collection by slug
// @route   GET /api/collections/:slug
export const getCollectionBySlug = async (req, res, next) => {
  try {
    const collection = await Collection.findOne({ slug: req.params.slug }).lean();
    if (!collection) {
      return res.status(404).json({ success: false, message: 'Collection not found' });
    }
    res.json({ success: true, data: collection });
  } catch (err) {
    next(err);
  }
};

// @desc    Update a collection (admin only)
// @route   PUT /api/collections/:id
export const updateCollection = async (req, res, next) => {
  try {
    const updates = { ...req.body };
    if (updates.name) updates.slug = slugify(updates.name);

    const collection = await Collection.findOneAndUpdate(
      { _id: req.params.id, is_deleted: { $ne: true } },
      updates,
      { new: true, runValidators: true }
    );
    if (!collection) {
      return res.status(404).json({ success: false, message: 'Collection not found' });
    }
    res.json({ success: true, data: collection });
  } catch (err) {
    next(err);
  }
};

// @desc    Soft delete a collection (admin only)
// @route   DELETE /api/collections/:id
export const deleteCollection = async (req, res, next) => {
  try {
    const collection = await Collection.findOne({ _id: req.params.id, is_deleted: { $ne: true } });
    if (!collection) {
      return res.status(404).json({ success: false, message: 'Collection not found' });
    }
    await collection.softDelete();
    res.json({ success: true, message: 'Collection soft-deleted' });
  } catch (err) {
    next(err);
  }
};
