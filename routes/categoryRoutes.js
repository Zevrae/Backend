import express from "express";
import {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} from "../controllers/categoryController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

router
  .route("/")
  .get(getCategories)
  .post(protect, authorize("admin"), createCategory);

router
  .route("/:id")
  .get(getCategoryById)
  .put(protect, authorize("admin"), updateCategory)
  .delete(protect, authorize("admin"), deleteCategory);

export default router;
