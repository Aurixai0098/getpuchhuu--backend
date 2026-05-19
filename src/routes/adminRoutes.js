// routes/adminRoutes.js

const express = require('express');
const { body, query } = require('express-validator');
const adminController = require('../controllers/adminController');
const withdrawalController = require('../controllers/withdrawalController'); // ✅ NEW
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

// ✅ All admin routes require authentication and admin role
router.use(protect);
router.use(authorize('admin'));

// Dashboard
router.get('/dashboard', adminController.getDashboardStats);

// Revenue Reports
router.get('/reports/revenue', adminController.getRevenueReport);
router.get('/reports/provider-earnings', adminController.getProviderEarnings);

// User Management
router.get('/users', adminController.getAllUsers);
router.get('/users/:id', adminController.getUserDetails);
router.put('/users/:id', adminController.updateUserByAdmin);          // ✅ NEW
router.get('/users/:id/stats', adminController.getUserStats);         // ✅ NEW
router.patch('/users/:id/status', 
    validate([
        body('status').isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status')
    ]),
    adminController.updateUserStatus
);

// Provider Management
router.get('/providers', adminController.getAllProviders);
router.get('/providers/status', adminController.getProviderStatusList);
router.get('/provider-earnings', adminController.getProviderEarningsList);
router.get('/provider-earnings/:providerId', adminController.getProviderEarningsDetails);

// KYC Verification Routes
router.get('/verifications', adminController.getVerificationRequests);
router.patch('/verifications/:id', adminController.verifyProviderKYC);
router.get('/providers/:id/documents', adminController.getProviderDocuments);

// Category Management
router.get('/categories', adminController.getAllCategories);
router.post('/categories',
    validate([
        body('name').notEmpty().withMessage('Category name is required'),
        body('slug').notEmpty().withMessage('Slug is required')
    ]),
    adminController.createCategory
);
router.put('/categories/:id',
    validate([
        body('name').notEmpty().withMessage('Category name is required')
    ]),
    adminController.updateCategory
);
router.delete('/categories/:id', adminController.deleteCategory);

// Service Management
router.get('/services', adminController.getAllServices);
router.post('/services',
    validate([
        body('name').notEmpty().withMessage('Service name is required'),
        body('category').notEmpty().withMessage('Category is required'),
        body('basePrice').isNumeric().withMessage('Base price must be a number')
    ]),
    adminController.createService
);
router.put('/services/:id',
    validate([
        body('name').notEmpty().withMessage('Service name is required')
    ]),
    adminController.updateService
);
router.delete('/services/:id', adminController.deleteService);

// Booking Management
router.get('/bookings', adminController.getAllBookings);

// Settings
router.get('/settings/commission', adminController.getCommissionSettings);
router.put('/settings/commission',
    validate([
        body('commissionPercentage').isNumeric().withMessage('Commission percentage must be a number')
    ]),
    adminController.updateCommissionSettings
);

// Withdrawal Management (existing) - FIXED: now uses withdrawalController.getAllWithdrawalRequests
router.get('/withdrawals', withdrawalController.getAllWithdrawalRequests);
router.patch('/withdrawals/:id/approve',
    validate([
        body('transactionId').notEmpty().withMessage('Transaction ID is required')
    ]),
    adminController.approveWithdrawal
);
router.patch('/withdrawals/:id/reject',
    validate([
        body('adminNote').optional().isString()
    ]),
    adminController.rejectWithdrawal
);

// ✅ NEW: Enhanced Withdrawal Management Routes (using withdrawalController)
router.patch('/withdrawals/:id/status', withdrawalController.updateWithdrawalStatus);
router.get('/provider-wallets', withdrawalController.getAllProviderWallets);
router.get('/providers/:providerId/withdrawals', withdrawalController.getProviderWithdrawals);

// ✅ NEW: Notifications routes (push & sms)
router.post('/notifications/push', adminController.sendPushNotification);
router.post('/notifications/sms', adminController.sendSmsAlert);

module.exports = router;