import Collection from "../models/Collection.js";

export const createCollection = async (req, res) => {
  try {
    const collection = await Collection.create(req.body);
    res.status(201).json({ success: true, data: collection });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getCollections = async (req, res) => {
  try {
    const collections = await Collection.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: collections });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCollectionBySlug = async (req, res) => {
  try {
    const collection = await Collection.findOne({ slug: req.params.slug });
    if (!collection) {
      return res
        .status(404)
        .json({ success: false, message: "Collection not found" });
    }
    res.status(200).json({ success: true, data: collection });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateCollection = async (req, res) => {
  try {
    const collection = await Collection.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      },
    );
    if (!collection) {
      return res
        .status(404)
        .json({ success: false, message: "Collection not found" });
    }
    res.status(200).json({ success: true, data: collection });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const deleteCollection = async (req, res) => {
  try {
    const collection = await Collection.findByIdAndDelete(req.params.id);
    if (!collection) {
      return res
        .status(404)
        .json({ success: false, message: "Collection not found" });
    }
    res
      .status(200)
      .json({ success: true, message: "Collection deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
