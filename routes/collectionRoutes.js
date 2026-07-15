import express from 'express';
import {
  createCollection,
  getCollections,
  getCollectionBySlug,
  updateCollection,
  deleteCollection,
} from '../controllers/collectionController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Collections
 *   description: Curated product collections (e.g. "New Arrivals", "Summer Sale")
 */

/**
 * @swagger
 * /collections:
 *   get:
 *     summary: List collections
 *     tags: [Collections]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, inactive] }
 *       - in: query
 *         name: featured
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: List of collections
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Collection' }
 *   post:
 *     summary: Create a collection (admin only)
 *     tags: [Collections]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CollectionInput'
 *     responses:
 *       201:
 *         description: Collection created
 */
router.route('/').get(getCollections).post(protect, authorize('admin'), createCollection);

/**
 * @swagger
 * /collections/{slug}:
 *   get:
 *     summary: Get a single collection by slug
 *     tags: [Collections]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Collection found
 *       404:
 *         description: Collection not found
 */
router.get('/:slug', getCollectionBySlug);

/**
 * @swagger
 * /collections/{id}:
 *   put:
 *     summary: Update a collection (admin only)
 *     tags: [Collections]
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
 *             $ref: '#/components/schemas/CollectionInput'
 *     responses:
 *       200:
 *         description: Collection updated
 *       404:
 *         description: Collection not found
 *   delete:
 *     summary: Soft-delete a collection (admin only)
 *     tags: [Collections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Collection soft-deleted
 *       404:
 *         description: Collection not found
 */
router.route('/:id').put(protect, authorize('admin'), updateCollection).delete(protect, authorize('admin'), deleteCollection);

export default router;
