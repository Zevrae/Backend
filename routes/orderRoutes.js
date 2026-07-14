import express from "express";
import {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
} from "../controllers/orderController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);

router.route("/").get(getOrders).post(createOrder);
router.get("/:id", getOrderById);
router.patch("/:id/status", authorize("admin"), updateOrderStatus);

export default router;
