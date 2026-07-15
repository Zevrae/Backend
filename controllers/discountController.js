import Discount from "../models/Discount.js";

// Create a new discount
export const createDiscount = async (req, res) => {
  try {
    const discount = await Discount.create(req.body);
    res.status(201).json({ success: true, data: discount });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get all discounts
export const getDiscounts = async (req, res) => {
  try {
    const discounts = await Discount.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: discounts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const useDiscount = async (req, res) => {
  try {
    const { code } = req.body;
    const discount = await Discount.findOne({ code });

    if (!discount) {
      return res
        .status(404)
        .json({ success: false, message: "Discount not found" });
    }

    if (discount.usageLimit <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Discount usage limit reached" });
    }

    // Decrease the usage limit by 1
    discount.usageLimit -= 1;
    await discount.save();

    res.status(200).json({ success: true, data: discount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

// Get a discount by code
export const getDiscountByCode = async (req, res) => {
  try {
    const discount = await Discount.findOne({ code: req.params.code });
    if (!discount) {
      return res
        .status(404)
        .json({ success: false, message: "Discount not found" });
    }
    res.status(200).json({ success: true, data: discount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update a discount
export const updateDiscount = async (req, res) => {
  try {
    const discount = await Discount.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!discount) {
      return res
        .status(404)
        .json({ success: false, message: "Discount not found" });
    }
    res.status(200).json({ success: true, data: discount });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Delete a discount
export const deleteDiscount = async (req, res) => {
  try {
    const discount = await Discount.findByIdAndDelete(req.params.id);
    if (!discount) {
      return res
        .status(404)
        .json({ success: false, message: "Discount not found" });
    }
    res
      .status(200)
      .json({ success: true, message: "Discount deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
