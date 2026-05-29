// src/routes/chatRoutes.js
const express = require('express');
const { protect } = require('../middleware/auth');
const chatController = require('../controllers/chatController');
const { upload } = require('../config/cloudinary');
const multer = require('multer');

const router = express.Router();
router.use(protect);

router.get('/:bookingId', chatController.getChatHistory);

// Image upload route with Multer error handling
router.post(
  '/upload',
  (req, res, next) => {
    upload.single('image')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, message: err.message });
      } else if (err) {
        return res.status(500).json({ success: false, message: 'File upload error' });
      }
      next();
    });
  },
  chatController.uploadChatImage
);

module.exports = router;