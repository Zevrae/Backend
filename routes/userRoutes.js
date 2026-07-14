import express from "express";
import {
  updateMe,
  getUsers,
  getUserById,
  deleteUser,
} from "../controllers/userController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

router.put("/me", protect, updateMe);

router.get("/", protect, authorize("admin"), getUsers);
router.get("/:id", protect, authorize("admin"), getUserById);
router.delete("/:id", protect, authorize("admin"), deleteUser);

export default router;
