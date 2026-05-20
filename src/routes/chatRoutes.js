// src/routes/chatRoutes.js
const express = require('express');
const { protect } = require('../middleware/auth');
const chatController = require('../controllers/chatController');

const router = express.Router();
router.use(protect);

router.get('/:bookingId', chatController.getChatHistory);

module.exports = router;