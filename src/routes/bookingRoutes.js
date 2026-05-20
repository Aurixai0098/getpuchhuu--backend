const express = require('express');
const { body, query } = require('express-validator');
const bookingController = require('../controllers/bookingController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

router.use(protect);

// Customer routes
router.post(
  '/',
  authorize('customer'),
  validate([
    body('services').isArray().withMessage('Services must be an array'),
    body('category').notEmpty().withMessage('Category is required'),
    body('scheduledDate').isISO8601().withMessage('Valid date is required'),
    body('scheduledTime.start').notEmpty().withMessage('Start time is required'),
    body('serviceAddress').notEmpty().withMessage('Service address is required'),
    body('payment.method').isIn(['online', 'cod', 'wallet']).withMessage('Invalid payment method')
  ]),
  bookingController.createBooking
);

router.get('/my-bookings', bookingController.getMyBookings);
router.get('/:id', bookingController.getBookingById);
router.patch('/:id/cancel', bookingController.cancelBooking);
router.patch('/:id/reschedule', bookingController.rescheduleBooking);

// Provider routes
router.patch('/:id/confirm', authorize('provider'), bookingController.confirmBooking);
router.patch('/:id/start', authorize('provider'), bookingController.startService);
// ✅ Accept booking – both POST and PATCH
router.post('/:id/accept', authorize('provider'), bookingController.acceptBooking);
router.patch('/:id/accept', authorize('provider'), bookingController.acceptBooking);

router.patch(
  '/:id/complete',
  authorize('provider'),
  validate([body('completionOTP').notEmpty().withMessage('Completion OTP is required')]),
  bookingController.completeService
);
router.post('/:id/generate-otp', authorize('provider'), bookingController.generateCompletionOTP);

module.exports = router;