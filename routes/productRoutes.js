import express from 'express';
import {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  restoreProduct,
  uploadProductImages,
  deleteProductImage,
} from '../controllers/productController.js';
import reviewRoutes from './reviewRoutes.js';
import { protect, authorize } from '../middleware/auth.js';
import { uploadImages } from '../middleware/upload.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Product catalog
 */

/**
 * @swagger
 * /products:
 *   get:
 *     summary: List products (paginated, filterable, searchable)
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: subcategory
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, inactive, draft, archived] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Full-text search across name & description
 *       - in: query
 *         name: sort
 *         schema: { type: string }
 *         description: "Comma-separated sort fields, e.g. -created_at,price"
 *     responses:
 *       200:
 *         description: Paginated list of products
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Product' }
 *   post:
 *     summary: Create a product (admin only)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProductInput'
 *     responses:
 *       201:
 *         description: Product created
 */
router.route('/').get(getProducts).post(protect, authorize('admin'), createProduct);

/**
 * @swagger
 * /products/{id}:
 *   get:
 *     summary: Get a single product
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product found
 *       404:
 *         description: Product not found
 *   put:
 *     summary: Update a product (admin only)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProductInput'
 *     responses:
 *       200:
 *         description: Product updated
 *   delete:
 *     summary: Soft-delete a product (admin only)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product soft-deleted
 */
router
  .route('/:id')
  .get(getProductById)
  .put(protect, authorize('admin'), updateProduct)
  .delete(protect, authorize('admin'), deleteProduct);

/**
 * @swagger
 * /products/{id}/restore:
 *   patch:
 *     summary: Restore a soft-deleted product (admin only)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product restored
 *       404:
 *         description: Deleted product not found
 */
router.patch('/:id/restore', protect, authorize('admin'), restoreProduct);

/**
 * @swagger
 * /products/{id}/images:
 *   post:
 *     summary: Upload one or more images for a product to Appwrite Storage (admin only)
 *     description: >
 *       Uploads via multipart/form-data under the "images" field (up to 5 files, 5MB each,
 *       JPEG/PNG/WEBP/GIF only). The resulting public URLs are appended to the product's `images` array.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Images uploaded and added to the product
 *       400:
 *         description: No files provided, or an invalid file type/size
 *       404:
 *         description: Product not found
 *       503:
 *         description: Appwrite is not configured on the server
 *   delete:
 *     summary: Remove an image from a product and delete it from Appwrite Storage (admin only)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [imageUrl]
 *             properties:
 *               imageUrl: { type: string, description: 'One of the URLs in the product''s images array' }
 *     responses:
 *       200:
 *         description: Image removed
 *       404:
 *         description: Product or image not found
 */
router
  .route('/:id/images')
  .post(protect, authorize('admin'), uploadImages, uploadProductImages)
  .delete(protect, authorize('admin'), deleteProductImage);

// Nested: /api/products/:productId/reviews
router.use('/:productId/reviews', reviewRoutes);

export default router;
