import Wishlist from "../models/Wishlist.js";

export const getWishlist = async (req, res, next) => {
  try {
    const items = await Wishlist.find({ user: req.user._id })
      .populate("product")
      .sort({ created_at: -1 });

    res.json({ success: true, items });
  } catch (err) {
    next(err);
  }
};

export const addToWishlist = async (req, res, next) => {
  try {
    const { productId } = req.params;

    const item = await Wishlist.findOneAndUpdate(
      { user: req.user._id, product: productId },
      { user: req.user._id, product: productId },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        runValidators: true,
      },
    );

    res.status(201).json({ success: true, item });
  } catch (err) {
    next(err);
  }
};

export const removeFromWishlist = async (req, res, next) => {
  try {
    const { productId } = req.params;

    await Wishlist.findOneAndDelete({
      user: req.user._id,
      product: productId,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

export const checkWishlist = async (req, res, next) => {
  try {
    const { productId } = req.params;

    const exists = await Wishlist.exists({
      user: req.user._id,
      product: productId,
    });

    res.json({ success: true, inWishlist: !!exists });
  } catch (err) {
    next(err);
  }
};
