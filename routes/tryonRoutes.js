import express from "express";
import multer from "multer";
import { processTryon } from "../controllers/tryonController.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post(
  "/",
  upload.fields([
    { name: "person_image", maxCount: 1 },
    { name: "cloth_image", maxCount: 1 },
  ]),
  processTryon,
);

export default router;
