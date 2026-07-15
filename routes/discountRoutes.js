import express from "express";
import {
  createDiscount,
  getDiscounts,
  getDiscountByCode,
  updateDiscount,
  deleteDiscount,
  useDiscount,
} from "../controllers/discountController.js";

const router = express.Router();

router.post("/", createDiscount);
router.get("/", getDiscounts);
router.get("/:code", getDiscountByCode);
router.put("/:id", updateDiscount);
router.delete("/:id", deleteDiscount);
router.post("/use", useDiscount);

export default router;
