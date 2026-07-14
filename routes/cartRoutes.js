import express from "express";
import {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
} from "../controllers/cartController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);

router.route("/").get(getCart).delete(clearCart);
router.post("/items", addItem);
router.route("/items/:itemId").put(updateItem).delete(removeItem);

export default router;
