// routes/authRoutes.js
const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const googleAuthController = require('../controllers/googleAuthController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

// Registration validation
const registerValidation = [
    body('firstName').trim().notEmpty().withMessage('First name is required').isLength({ min: 2, max: 50 }),
    body('lastName').trim().notEmpty().withMessage('Last name is required').isLength({ min: 2, max: 50 }),
    body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
    body('phone').matches(/^[6-9]\d{9}$/).withMessage('Invalid Indian phone number (10 digits starting with 6-9)'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters').matches(/^(?=.*[A-Za-z])(?=.*\d)/).withMessage('Password must contain at least one letter and one number'),
    body('avatarUrl').optional().isURL().withMessage('Invalid avatar URL')
];

const loginValidation = [
    body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required')
];

const forgotPasswordValidation = [
    body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail()
];

const resetPasswordValidation = [
    body('token').notEmpty().withMessage('Reset token is required'),
    body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters').matches(/^(?=.*[A-Za-z])(?=.*\d)/).withMessage('Password must contain at least one letter and one number')
];

const changePasswordValidation = [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters').matches(/^(?=.*[A-Za-z])(?=.*\d)/).withMessage('Password must contain at least one letter and one number')
];

// Public routes
router.post('/register', validate(registerValidation), authController.register);
router.post('/login', validate(loginValidation), authController.login);
router.post('/forgot-password', validate(forgotPasswordValidation), authController.forgotPassword);
router.post('/reset-password', validate(resetPasswordValidation), authController.resetPassword);
router.post('/refresh-token', authController.refreshAccessToken);
router.post('/google', googleAuthController.googleAuth); // ✅ Google OAuth route

// Protected routes
router.get('/me', protect, authController.getMe);
router.post('/logout', protect, authController.logout);
router.post('/change-password', protect, validate(changePasswordValidation), authController.changePassword);

module.exports = router;