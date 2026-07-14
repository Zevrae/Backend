import express from "express";
import {
  createReview,
  getReviewsForProduct,
  updateReview,
  deleteReview,
} from "../controllers/reviewController.js";
import { protect } from "../middleware/auth.js";

// mergeParams lets this router read :productId when mounted inside productRoutes
const router = express.Router({ mergeParams: true });

// Mounted at /api/products/:productId/reviews
router.route("/").get(getReviewsForProduct).post(protect, createReview);

// Standalone router for /api/reviews/:id (update/delete by review id)
export const standaloneRouter = express.Router();
standaloneRouter.put("/:id", protect, updateReview);
standaloneRouter.delete("/:id", protect, deleteReview);

export default router;
