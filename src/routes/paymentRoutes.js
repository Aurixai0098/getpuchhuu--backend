// routes/paymentRoutes.js
const express = require('express');
const paymentController = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All payment routes require authentication
router.use(protect);

// Payment endpoints
router.post('/create-order', paymentController.createOrder);
router.post('/verify', paymentController.verifyPayment);
router.get('/history', paymentController.getPaymentHistory);
router.post('/withdraw', paymentController.withdrawFromWallet);

// Webhook (no auth required - must be before protect middleware)
// But since webhook doesn't need auth, we'll mount it separately in app.js

module.exports = router;