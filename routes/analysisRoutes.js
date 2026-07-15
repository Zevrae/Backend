import { Router } from "express";
import {
  getAnalysis,
  updateAnalysis,
} from "../controllers/analysisController.js";

const router = Router();
router.get("/", getAnalysis);
router.put("/", updateAnalysis);

export default router;
