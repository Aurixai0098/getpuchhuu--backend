const express = require('express');
const { body, query } = require('express-validator');
const bookingController = require('../controllers/bookingController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { upload } = require('../config/cloudinary');

const router = express.Router();

router.use(protect);

// Customer routes – updated validation to accept JSON strings
router.post(
  '/',
  authorize('customer'),
  upload.array('images', 3),
  validate([
    body('services').isString().withMessage('Services must be a JSON string'),
    body('category').notEmpty().withMessage('Category is required'),
    body('scheduledDate').isISO8601().withMessage('Valid date is required'),
    body('scheduledTime').isString().withMessage('Scheduled time must be a JSON string'),
    body('serviceAddress').isString().withMessage('Service address must be a JSON string'),
    body('payment').isString().withMessage('Payment must be a JSON string'),
  ]),
  bookingController.createBooking
);

router.get('/my-bookings', bookingController.getMyBookings);
router.get('/:id', bookingController.getBookingById);
router.patch('/:id/cancel', bookingController.cancelBooking);
router.patch('/:id/reschedule', bookingController.rescheduleBooking);

// New: Provider offer and customer confirm/reject
router.post('/:id/provider-offer', authorize('provider'), bookingController.providerOffer);
router.post('/:id/confirm-offer', authorize('customer'), bookingController.confirmOffer);
router.post('/:id/reject-offer', authorize('customer'), bookingController.rejectOffer);

// Provider routes
router.patch('/:id/confirm', authorize('provider'), bookingController.confirmBooking);
router.patch('/:id/start', authorize('provider'), bookingController.startService);
router.post('/:id/accept', authorize('provider'), bookingController.acceptBooking);
router.patch('/:id/accept', authorize('provider'), bookingController.acceptBooking);
router.patch('/:id/complete', authorize('provider'), validate([body('completionOTP').notEmpty()]), bookingController.completeService);
router.post('/:id/generate-otp', authorize('provider'), bookingController.generateCompletionOTP);

module.exports = router;