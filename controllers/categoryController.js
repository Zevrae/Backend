import Category from "../models/Category.js";

const slugify = (str) =>
  str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// @desc    Create a category
// @route   POST /api/categories
export const createCategory = async (req, res, next) => {
  try {
    const { name, description, parent, status } = req.body;

    const category = await Category.create({
      name,
      slug: slugify(name),
      description,
      parent: parent || null,
      status,
    });

    res.status(201).json({
      success: true,
      data: category,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all categories
// @route   GET /api/categories
export const getCategories = async (req, res, next) => {
  try {
    const filter = {};

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.parent) {
      filter.parent = req.query.parent === "null" ? null : req.query.parent;
    }

    const categories = await Category.find(filter).sort("name").lean();

    res.json({
      success: true,
      data: categories,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get a single category
// @route   GET /api/categories/:id
export const getCategoryById = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id)
      .populate("parent", "name slug")
      .lean();

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    res.json({
      success: true,
      data: category,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update a category
// @route   PUT /api/categories/:id
export const updateCategory = async (req, res, next) => {
  try {
    const updates = { ...req.body };

    if (updates.name) {
      updates.slug = slugify(updates.name);
    }

    const category = await Category.findOneAndUpdate(
      {
        _id: req.params.id,
        is_deleted: { $ne: true },
      },
      updates,
      {
        new: true,
        runValidators: true,
      },
    );

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    res.json({
      success: true,
      data: category,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Soft delete a category
// @route   DELETE /api/categories/:id
export const deleteCategory = async (req, res, next) => {
  try {
    const category = await Category.findOne({
      _id: req.params.id,
      is_deleted: { $ne: true },
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    await category.softDelete();

    res.json({
      success: true,
      message: "Category soft-deleted",
    });
  } catch (err) {
    next(err);
  }
};
