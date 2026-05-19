// controllers/providerController.js

const ServiceProvider = require('../models/ServiceProvider');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { uploadToCloudinary } = require('../config/cloudinary');

// @desc    Register as service provider
// @route   POST /api/v1/providers/register
exports.registerProvider = asyncHandler(async (req, res) => {
    const existingProvider = await ServiceProvider.findOne({ user: req.user._id });
    if (existingProvider) {
        throw new ApiError(400, 'You are already registered as a service provider');
    }
    
    const providerData = {
        user: req.user._id,
        ...req.body,
        verificationStatus: 'pending'
    };
    
    const provider = await ServiceProvider.create(providerData);
    
    await User.findByIdAndUpdate(req.user._id, { role: 'provider' });
    
    new ApiResponse(201, { provider }, 'Provider registration submitted for verification').send(res);
});

// @desc    Get provider profile
// @route   GET /api/v1/providers/profile
exports.getProfile = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOne({ user: req.user._id })
        .populate('services.category', 'name slug')
        .populate('services.subServices', 'name slug basePrice');
    
    if (!provider) {
        throw new ApiError(404, 'Provider profile not found');
    }
    
    new ApiResponse(200, { provider }, 'Profile fetched').send(res);
});

// @desc    Update provider profile
// @route   PUT /api/v1/providers/profile
exports.updateProfile = asyncHandler(async (req, res) => {
    const allowedFields = [
        'businessName', 'bio', 'experience', 'workingHours',
        'isAvailable', 'unavailableDates'
    ];
    
    const updateData = {};
    Object.keys(req.body).forEach(key => {
        if (allowedFields.includes(key)) {
            updateData[key] = req.body[key];
        }
    });
    
    const provider = await ServiceProvider.findOneAndUpdate(
        { user: req.user._id },
        updateData,
        { new: true, runValidators: true }
    );
    
    if (!provider) {
        throw new ApiError(404, 'Provider profile not found');
    }
    
    new ApiResponse(200, { provider }, 'Profile updated').send(res);
});

// @desc    Add service to provider
// @route   POST /api/v1/providers/services
exports.addService = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    
    if (!provider) {
        throw new ApiError(404, 'Provider profile not found');
    }
    
    // Check if provider is verified
    if (provider.verificationStatus !== 'verified') {
        throw new ApiError(403, 'Please complete KYC verification first to add services');
    }
    
    const existingService = provider.services.find(
        s => s.category.toString() === req.body.category
    );
    
    if (existingService) {
        throw new ApiError(400, 'Service already added for this category');
    }
    
    provider.services.push(req.body);
    await provider.save();
    
    new ApiResponse(201, { services: provider.services }, 'Service added').send(res);
});

// @desc    Update service
// @route   PUT /api/v1/providers/services/:serviceId
exports.updateService = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    
    if (!provider) {
        throw new ApiError(404, 'Provider profile not found');
    }
    
    const service = provider.services.id(req.params.serviceId);
    if (!service) {
        throw new ApiError(404, 'Service not found');
    }
    
    Object.assign(service, req.body);
    await provider.save();
    
    new ApiResponse(200, { services: provider.services }, 'Service updated').send(res);
});

// @desc    Remove service
// @route   DELETE /api/v1/providers/services/:serviceId
exports.removeService = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    
    if (!provider) {
        throw new ApiError(404, 'Provider profile not found');
    }
    
    provider.services.id(req.params.serviceId).deleteOne();
    await provider.save();
    
    new ApiResponse(200, null, 'Service removed').send(res);
});

// @desc    Update service area
// @route   PUT /api/v1/providers/service-area
exports.updateServiceArea = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOneAndUpdate(
        { user: req.user._id },
        { serviceArea: req.body },
        { new: true }
    );
    
    if (!provider) {
        throw new ApiError(404, 'Provider profile not found');
    }
    
    new ApiResponse(200, { serviceArea: provider.serviceArea }, 'Service area updated').send(res);
});

// @desc    Upload KYC documents with Multer (Aadhaar front, Aadhaar back, PAN)
// @route   POST /api/v1/providers/upload-kyc
exports.uploadKYCDocuments = asyncHandler(async (req, res) => {
    console.log('========== UPLOAD KYC DOCUMENTS ==========');
    console.log('Files received:', req.files);
    console.log('Body received:', req.body);
    
    const { aadharNumber, panNumber } = req.body;
    
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    if (!provider) {
        throw new ApiError(404, 'Provider profile not found');
    }
    
    // Get uploaded files from multer
    const files = req.files || {};
    
    // Upload Aadhaar front
    if (files.aadharFront && files.aadharFront[0]) {
        console.log('Uploading Aadhaar front...');
        const result = await uploadToCloudinary(files.aadharFront[0].buffer, 'gharseva/kyc-documents');
        console.log('Aadhaar front uploaded:', result.secure_url);
        
        const existingAadhar = provider.documents.find(doc => doc.type === 'aadhar');
        if (existingAadhar) {
            existingAadhar.frontImage = {
                url: result.secure_url,
                publicId: result.public_id
            };
            existingAadhar.documentNumber = aadharNumber || existingAadhar.documentNumber;
            existingAadhar.isVerified = false;
            existingAadhar.verifiedAt = null;
            existingAadhar.verifiedBy = null;
        } else {
            provider.documents.push({
                type: 'aadhar',
                documentNumber: aadharNumber,
                frontImage: {
                    url: result.secure_url,
                    publicId: result.public_id
                },
                isVerified: false
            });
        }
    }
    
    // Upload Aadhaar back
    if (files.aadharBack && files.aadharBack[0]) {
        console.log('Uploading Aadhaar back...');
        const result = await uploadToCloudinary(files.aadharBack[0].buffer, 'gharseva/kyc-documents');
        console.log('Aadhaar back uploaded:', result.secure_url);
        
        const existingAadhar = provider.documents.find(doc => doc.type === 'aadhar');
        if (existingAadhar) {
            existingAadhar.backImage = {
                url: result.secure_url,
                publicId: result.public_id
            };
        } else {
            const existingDoc = provider.documents.find(doc => doc.type === 'aadhar');
            if (existingDoc) {
                existingDoc.backImage = {
                    url: result.secure_url,
                    publicId: result.public_id
                };
            }
        }
    }
    
    // Upload PAN card
    if (files.panFront && files.panFront[0]) {
        console.log('Uploading PAN card...');
        const result = await uploadToCloudinary(files.panFront[0].buffer, 'gharseva/kyc-documents');
        console.log('PAN card uploaded:', result.secure_url);
        
        const existingPan = provider.documents.find(doc => doc.type === 'pan');
        if (existingPan) {
            existingPan.frontImage = {
                url: result.secure_url,
                publicId: result.public_id
            };
            existingPan.documentNumber = panNumber || existingPan.documentNumber;
            existingPan.isVerified = false;
            existingPan.verifiedAt = null;
            existingPan.verifiedBy = null;
        } else {
            provider.documents.push({
                type: 'pan',
                documentNumber: panNumber,
                frontImage: {
                    url: result.secure_url,
                    publicId: result.public_id
                },
                isVerified: false
            });
        }
    }
    
    // Set verification status to pending
    if (provider.verificationStatus === 'rejected' || provider.verificationStatus === 'pending') {
        provider.verificationStatus = 'pending';
    }
    
    await provider.save();
    
    // Create notification for admin
    const Notification = require('../models/Notification');
    const adminUsers = await User.find({ role: 'admin' });
    for (const admin of adminUsers) {
        await Notification.create({
            recipient: admin._id,
            type: 'system',
            title: 'New KYC Documents Uploaded',
            message: `${provider.businessName || req.user.fullName} has uploaded KYC documents for verification`,
            reference: { model: 'ServiceProvider', id: provider._id },
            channels: { inApp: true, email: true }
        });
    }
    
    console.log('Documents saved successfully');
    console.log('=========================================');
    
    new ApiResponse(200, { 
        documents: provider.documents,
        verificationStatus: provider.verificationStatus
    }, 'Documents uploaded successfully. Verification pending.').send(res);
});

// @desc    Get provider verification status
// @route   GET /api/v1/providers/verification-status
exports.getVerificationStatus = asyncHandler(async (req, res) => {
    console.log('Getting verification status for user:', req.user._id);
    
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    if (!provider) {
        throw new ApiError(404, 'Provider profile not found');
    }
    
    const documents = {
        aadhar: provider.documents.find(doc => doc.type === 'aadhar') || null,
        pan: provider.documents.find(doc => doc.type === 'pan') || null
    };
    
    const hasAadhaar = !!documents.aadhar;
    const hasPAN = !!documents.pan;
    
    // Determine if fully verified
    let isFullyVerified = false;
    let verificationMessage = '';
    
    if (provider.verificationStatus === 'verified') {
        if (hasAadhaar && hasPAN) {
            isFullyVerified = true;
            verificationMessage = 'All your documents are verified. You have full access to all features.';
        } else if (hasAadhaar && !hasPAN) {
            verificationMessage = 'Your Aadhaar card is verified. Please upload PAN card for full verification.';
        } else if (!hasAadhaar && hasPAN) {
            verificationMessage = 'Your PAN card is verified. Please upload Aadhaar card for full verification.';
        }
    } else if (provider.verificationStatus === 'rejected') {
        verificationMessage = provider.verificationNote || 'Your documents were rejected. Please upload clear copies.';
    } else if (provider.verificationStatus === 'under_review') {
        verificationMessage = 'Your documents are under review. Please wait for admin verification.';
    } else {
        verificationMessage = 'Please upload your KYC documents to start accepting bookings.';
    }
    
    new ApiResponse(200, {
        verificationStatus: provider.verificationStatus,
        verificationNote: provider.verificationNote,
        isVerified: provider.verificationStatus === 'verified',
        isFullyVerified,
        verificationMessage,
        hasAadhaar,
        hasPAN,
        documents
    }, 'Verification status fetched').send(res);
});

// @desc    Update bank details
// @route   PUT /api/v1/providers/bank-details
exports.updateBankDetails = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOneAndUpdate(
        { user: req.user._id },
        { bankDetails: req.body },
        { new: true }
    );
    
    if (!provider) {
        throw new ApiError(404, 'Provider profile not found');
    }
    
    new ApiResponse(200, { bankDetails: provider.bankDetails }, 'Bank details updated').send(res);
});

// @desc    Get provider stats
// @route   GET /api/v1/providers/stats
exports.getStats = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    
    if (!provider) {
        throw new ApiError(404, 'Provider profile not found');
    }
    
    const Booking = require('../models/Booking');
    const recentBookings = await Booking.find({ provider: provider._id })
        .sort('-createdAt')
        .limit(5)
        .select('bookingId status scheduledDate pricing.total');
    
    const earningsSummary = await Booking.aggregate([
        {
            $match: {
                provider: provider._id,
                status: 'completed'
            }
        },
        {
            $group: {
                _id: { $month: '$createdAt' },
                total: { $sum: '$pricing.total' },
                count: { $sum: 1 }
            }
        },
        { $sort: { '_id': -1 } },
        { $limit: 12 }
    ]);
    
    new ApiResponse(200, {
        stats: provider.stats,
        rating: provider.rating,
        recentBookings,
        earningsSummary
    }, 'Stats fetched').send(res);
});

// @desc    Get public provider profile
// @route   GET /api/v1/providers/:id/public
exports.getPublicProfile = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findById(req.params.id)
        .populate('user', 'firstName lastName avatar')
        .populate('services.category', 'name slug')
        .populate('services.subServices', 'name slug basePrice');
    
    if (!provider) {
        throw new ApiError(404, 'Provider not found');
    }
    
    const Review = require('../models/Review');
    const reviews = await Review.find({
        provider: provider._id,
        status: 'approved'
    })
        .populate('customer', 'firstName lastName avatar')
        .sort('-createdAt')
        .limit(10);
    
    new ApiResponse(200, { provider, reviews }, 'Provider profile fetched').send(res);
});

// @desc    Search providers by location, pincode, city, or coordinates with radius
// @route   GET /api/v1/providers/search
exports.searchProviders = asyncHandler(async (req, res) => {
    const { 
        latitude, 
        longitude, 
        radius = 10,
        service, 
        pincode, 
        city,
        page = 1, 
        limit = 10 
    } = req.query;

    const query = {
        verificationStatus: 'verified',
        isAvailable: true
    };

    if (service) {
        query['services.category'] = service;
    }

    let locationFilter = {};

    if (latitude && longitude) {
        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);
        const maxDistance = parseFloat(radius) * 1000;

        locationFilter = {
            serviceArea: {
                $nearSphere: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [lng, lat]
                    },
                    $maxDistance: maxDistance
                }
            }
        };
    } 
    else if (pincode) {
        query['serviceArea.pincodes'] = pincode;
    }
    else if (city) {
        query['serviceArea.cities'] = { $regex: new RegExp(`^${city}$`, 'i') };
    }

    Object.assign(query, locationFilter);

    if (!latitude && !longitude && !pincode && !city) {
        return new ApiResponse(200, {
            providers: [],
            pagination: { page: 1, limit, total: 0, pages: 0 }
        }, 'No location criteria provided').send(res);
    }

    const providers = await ServiceProvider.find(query)
        .populate('user', 'firstName lastName avatar')
        .populate('services.category', 'name slug')
        .sort('-rating.average')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const total = await ServiceProvider.countDocuments(query);

    new ApiResponse(200, {
        providers,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        }
    }, 'Providers fetched').send(res);
});

// @desc    Get provider notifications
// @route   GET /api/v1/providers/notifications
exports.getNotifications = asyncHandler(async (req, res) => {
    const Notification = require('../models/Notification');
    const notifications = await Notification.find({ recipient: req.user._id })
        .sort('-createdAt')
        .limit(50);
    const unreadCount = await Notification.countDocuments({ recipient: req.user._id, isRead: false });
    new ApiResponse(200, { notifications, unreadCount }, 'Notifications fetched').send(res);
});

// @desc    Mark notification as read
// @route   PATCH /api/v1/providers/notifications/:id/read
exports.markNotificationRead = asyncHandler(async (req, res) => {
    const Notification = require('../models/Notification');
    const notification = await Notification.findOneAndUpdate(
        { _id: req.params.id, recipient: req.user._id },
        { isRead: true, readAt: new Date() },
        { new: true }
    );
    if (!notification) throw new ApiError(404, 'Notification not found');
    new ApiResponse(200, { notification }, 'Marked as read').send(res);
});

// ========== HEARTBEAT (ONLINE STATUS) ==========
// @desc    Update provider heartbeat (keeps lastActive timestamp)
// @route   POST /api/v1/providers/heartbeat
exports.updateHeartbeat = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    if (!provider) {
        throw new ApiError(404, 'Provider profile not found');
    }
    provider.lastActive = new Date();
    await provider.save({ validateBeforeSave: false });
    new ApiResponse(200, { lastActive: provider.lastActive }, 'Heartbeat updated').send(res);
});

// ========== FEATURED PROVIDERS FOR HOMEPAGE (PUBLIC) ==========
// @desc    Get featured providers for homepage with earnings, completed jobs, etc.
// @route   GET /api/v1/providers/featured
exports.getFeaturedProviders = asyncHandler(async (req, res) => {
    const { limit = 20 } = req.query;
    
    // Find verified providers with at least one completed booking
    const providers = await ServiceProvider.find({
        verificationStatus: 'verified',
        isAvailable: true,
        'stats.completedBookings': { $gt: 0 }
    })
    .populate('user', 'firstName lastName avatar phone email')
    .sort('-rating.average')
    .limit(parseInt(limit));

    const Wallet = require('../models/Wallet');
    const providerData = await Promise.all(providers.map(async (provider) => {
        const wallet = await Wallet.findOne({ user: provider.user._id });
        const totalEarnings = wallet ? wallet.totalEarnings : 0;
        const completedJobs = provider.stats?.completedBookings || 0;
        const experienceYears = provider.experience?.years || 0;
        const avgRating = provider.rating?.average || 0;
        const reviewCount = provider.rating?.count || 0;
        const isOnline = provider.isAvailable && provider.lastActive > new Date(Date.now() - 1 * 60 * 1000);

        return {
            id: provider._id,
            businessName: provider.businessName || `${provider.user.firstName} ${provider.user.lastName}`,
            ownerName: `${provider.user.firstName} ${provider.user.lastName}`,
            avatar: provider.user.avatar?.url || `https://ui-avatars.com/api/?name=${encodeURIComponent(provider.businessName || provider.user.firstName)}&background=10b981&color=fff`,
            rating: avgRating,
            reviewCount: reviewCount,
            isOnline: isOnline,
            isVerified: true,
            completedJobs,
            totalEarnings,
            experienceYears
        };
    }));

    new ApiResponse(200, { providers: providerData }, 'Featured providers fetched').send(res);
});