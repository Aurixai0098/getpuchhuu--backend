// routes/cartRoutes.js
const express = require('express');
const { protect } = require('../middleware/auth');
const cartController = require('../controllers/cartController');

const router = express.Router();
router.use(protect);

router.get('/', cartController.getCart);
router.put('/', cartController.updateCart);
router.delete('/', cartController.clearCart);

module.exports = router;