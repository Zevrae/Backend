import express from "express";
import { protect } from "../middleware/auth.js";
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  checkWishlist,
} from "../controllers/wishlistController.js";

const router = express.Router();

router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Wishlist
 *   description: The logged-in user's saved/wishlisted products
 */

/**
 * @swagger
 * /wishlist:
 *   get:
 *     summary: Get the current user's wishlist
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The wishlist, with each item's product populated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 items:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Product' }
 */
router.route("/").get(getWishlist);

/**
 * @swagger
 * /wishlist/check/{productId}:
 *   get:
 *     summary: Check whether a product is already in the current user's wishlist
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Membership check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 inWishlist: { type: boolean }
 */
router.get("/check/:productId", checkWishlist);

/**
 * @swagger
 * /wishlist/{productId}:
 *   post:
 *     summary: Add a product to the wishlist (idempotent)
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201:
 *         description: Product added (or already present)
 *   delete:
 *     summary: Remove a product from the wishlist
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product removed (no-op if it wasn't wishlisted)
 */
router.route("/:productId").post(addToWishlist).delete(removeFromWishlist);

export default router;
