// routes/userRoutes.js

const express = require('express');
const userController = require('../controllers/userController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { body } = require('express-validator');
const { upload } = require('../config/cloudinary');

const router = express.Router();

router.use(protect); // All routes require authentication

// Profile routes
router.put('/profile', userController.updateProfile);
router.post('/avatar', upload.single('avatar'), userController.uploadAvatar);
router.delete('/avatar', userController.removeAvatar);

// Address routes
router.get('/addresses', userController.getAddresses);
router.post('/addresses', userController.addAddress);
router.put('/addresses/:addressId', userController.updateAddress);
router.delete('/addresses/:addressId', userController.deleteAddress);
router.patch('/addresses/:addressId/default', userController.setDefaultAddress);

// Notification preferences
router.put('/notification-preferences', userController.updateNotificationPreferences);

// Wallet & Notifications
router.get('/wallet', userController.getWallet);
router.get('/notifications', userController.getNotifications);
router.patch('/notifications/:id/read', userController.markNotificationRead);
router.patch('/notifications/read-all', userController.markAllNotificationsRead);

module.exports = router;