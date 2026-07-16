import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import Tryon from "../models/Tryon.js";

// POST /api/tryon
export const processTryon = async (req, res) => {
  try {
    const { userId, productId } = req.body;
    const { person_image, cloth_image } = req.files;

    if (!userId || !productId) {
      return res
        .status(400)
        .json({ success: false, message: "userId and productId are required" });
    }
    if (!person_image || !cloth_image) {
      return res
        .status(400)
        .json({ success: false, message: "Both images are required" });
    }

    // Prepare multipart form data for external microservice
    const formData = new FormData();
    formData.append("person_image", fs.createReadStream(person_image[0].path));
    formData.append("cloth_image", fs.createReadStream(cloth_image[0].path));

    const response = await axios.post(
      `${process.env.TRYON_SERVICE_URL}/api/v1/tryon`,
      formData,
      { headers: formData.getHeaders() },
    );

    const { image_url } = response.data;

    // Save to MongoDB according to schema
    const record = await Tryon.create({
      userId,
      productId,
      imageUrl: image_url,
    });

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.response?.data?.message || error.message,
    });
  }
};
