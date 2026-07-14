const express = require('express');
const router = express.Router();
const { getCart, addItem, updateItem, removeItem, clearCart } = require('../controllers/cartController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/').get(getCart).delete(clearCart);
router.post('/items', addItem);
router.route('/items/:itemId').put(updateItem).delete(removeItem);

module.exports = router;
