// controllers/reviewController.js

const mongoose = require('mongoose');  // ✅ IMPORTANT: missing import
const Review = require('../models/Review');
const Booking = require('../models/Booking');
const ServiceProvider = require('../models/ServiceProvider');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Create review
// @route   POST /api/v1/reviews
exports.createReview = asyncHandler(async (req, res) => {
    const { booking: bookingId, rating, title, comment } = req.body;
    
    // Check if booking exists and belongs to user
    const booking = await Booking.findById(bookingId);
    if (!booking) {
        throw new ApiError(404, 'Booking not found');
    }
    
    if (booking.customer.toString() !== req.user._id.toString()) {
        throw new ApiError(403, 'Not authorized to review this booking');
    }
    
    if (booking.status !== 'completed') {
        throw new ApiError(400, 'Can only review completed bookings');
    }
    
    if (booking.hasReviewed) {
        throw new ApiError(400, 'You have already reviewed this booking');
    }
    
    // Create review
    const review = await Review.create({
        booking: bookingId,
        customer: req.user._id,
        provider: booking.provider,
        service: booking.items[0].service,
        rating,
        title,
        comment
    });
    
    // Update booking
    booking.hasReviewed = true;
    await booking.save();
    
    new ApiResponse(201, { review }, 'Review submitted successfully').send(res);
});

// @desc    Get reviews for provider
// @route   GET /api/v1/reviews/provider/:providerId
exports.getProviderReviews = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, rating, sort = '-createdAt' } = req.query;
    
    const query = {
        provider: req.params.providerId,
        status: 'approved'
    };
    
    if (rating) {
        query['rating.overall'] = parseInt(rating);
    }
    
    const reviews = await Review.find(query)
        .populate('customer', 'firstName lastName avatar')
        .populate('service', 'name slug')
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(parseInt(limit));
    
    const total = await Review.countDocuments(query);
    
    // Get rating stats – FIX: use mongoose.Types.ObjectId correctly
    const stats = await Review.aggregate([
        { $match: { provider: new mongoose.Types.ObjectId(req.params.providerId), status: 'approved' } },
        {
            $group: {
                _id: null,
                average: { $avg: '$rating.overall' },
                count: { $sum: 1 },
                five: { $sum: { $cond: [{ $eq: ['$rating.overall', 5] }, 1, 0] } },
                four: { $sum: { $cond: [{ $eq: ['$rating.overall', 4] }, 1, 0] } },
                three: { $sum: { $cond: [{ $eq: ['$rating.overall', 3] }, 1, 0] } },
                two: { $sum: { $cond: [{ $eq: ['$rating.overall', 2] }, 1, 0] } },
                one: { $sum: { $cond: [{ $eq: ['$rating.overall', 1] }, 1, 0] } }
            }
        }
    ]);
    
    new ApiResponse(200, {
        reviews,
        stats: stats[0] || {},
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        }
    }, 'Reviews fetched').send(res);
});

// @desc    Add provider response
// @route   POST /api/v1/reviews/:id/response
exports.addProviderResponse = asyncHandler(async (req, res) => {
    const review = await Review.findById(req.params.id);
    if (!review) throw new ApiError(404, 'Review not found');
    
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    if (!provider || provider._id.toString() !== review.provider.toString()) {
        throw new ApiError(403, 'Not authorized to respond to this review');
    }
    
    review.providerResponse = {
        comment: req.body.comment,
        respondedAt: new Date()
    };
    await review.save();
    
    new ApiResponse(200, { review }, 'Response added').send(res);
});

// @desc    Mark review as helpful
// @route   POST /api/v1/reviews/:id/helpful
exports.markHelpful = asyncHandler(async (req, res) => {
    const review = await Review.findById(req.params.id);
    if (!review) throw new ApiError(404, 'Review not found');
    
    const alreadyMarked = review.helpful.users.includes(req.user._id);
    if (alreadyMarked) {
        review.helpful.users.pull(req.user._id);
        review.helpful.count--;
    } else {
        review.helpful.users.push(req.user._id);
        review.helpful.count++;
    }
    await review.save();
    
    new ApiResponse(200, {
        helpful: review.helpful,
        isHelpful: !alreadyMarked
    }, alreadyMarked ? 'Vote removed' : 'Marked as helpful').send(res);
});