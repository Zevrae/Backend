import express from "express";
import {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  restoreProduct,
} from "../controllers/productController.js";
import reviewRoutes from "./reviewRoutes.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

router
  .route("/")
  .get(getProducts)
  .post(protect, authorize("admin"), createProduct);

router
  .route("/:id")
  .get(getProductById)
  .put(protect, authorize("admin"), updateProduct)
  .delete(protect, authorize("admin"), deleteProduct);

router.patch("/:id/restore", protect, authorize("admin"), restoreProduct);

// Nested: /api/products/:productId/reviews
router.use("/:productId/reviews", reviewRoutes);

export default router;
