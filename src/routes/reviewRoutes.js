const express = require('express');
const reviewController = require('../controllers/reviewController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { body } = require('express-validator');

const router = express.Router();

// Public routes
router.get('/provider/:providerId', reviewController.getProviderReviews);

// Protected routes
router.use(protect);

router.post('/', validate([
    body('booking').notEmpty(),
    body('rating.overall').isInt({ min: 1, max: 5 }),
    body('comment').notEmpty()
]), reviewController.createReview);

router.post('/:id/response', reviewController.addProviderResponse);
router.post('/:id/helpful', reviewController.markHelpful);

module.exports = router;