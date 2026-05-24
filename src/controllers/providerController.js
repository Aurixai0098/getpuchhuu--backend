// Full providerController.js (with registerProvider fix)
const ServiceProvider = require('../models/ServiceProvider');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { uploadToCloudinary } = require('../config/cloudinary');

// Helper: Distance calculation
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
function deg2rad(deg) { return deg * (Math.PI/180); }

// Helper: Default working hours
function getDefaultWorkingHours() {
  return [
    { day: 'monday', isWorking: true, slots: [{ startTime: '09:00', endTime: '18:00' }] },
    { day: 'tuesday', isWorking: true, slots: [{ startTime: '09:00', endTime: '18:00' }] },
    { day: 'wednesday', isWorking: true, slots: [{ startTime: '09:00', endTime: '18:00' }] },
    { day: 'thursday', isWorking: true, slots: [{ startTime: '09:00', endTime: '18:00' }] },
    { day: 'friday', isWorking: true, slots: [{ startTime: '09:00', endTime: '18:00' }] },
    { day: 'saturday', isWorking: true, slots: [{ startTime: '09:00', endTime: '14:00' }] },
    { day: 'sunday', isWorking: false, slots: [] }
  ];
}

async function checkLocationInServiceArea(provider, lat, lng) {
  const radius = provider.serviceArea?.radius || 10;
  const center = provider.serviceArea?.coordinates;
  if (!center || !center.coordinates || (center.coordinates[0] === 0 && center.coordinates[1] === 0)) return true;
  const distance = getDistanceFromLatLonInKm(lat, lng, center.coordinates[1], center.coordinates[0]);
  return distance <= radius;
}

// @desc    Register as service provider
exports.registerProvider = asyncHandler(async (req, res) => {
    const existingProvider = await ServiceProvider.findOne({ user: req.user._id });
    if (existingProvider) throw new ApiError(400, 'You are already registered as a service provider');
    
    const { businessName, bio, experience, services, serviceArea, workingHours } = req.body;
    if (!businessName || !bio) throw new ApiError(400, 'Business name and bio are required');
    if (!services || !services.length || !services[0].category || !services[0].subServices?.length) {
        throw new ApiError(400, 'At least one category and one sub-service are required');
    }
    
    const providerData = {
        user: req.user._id,
        businessName,
        bio,
        experience: experience || { years: 0, description: '' },
        services,
        workingHours: workingHours || getDefaultWorkingHours(),
        serviceArea: {
            ...serviceArea,
            coordinates: serviceArea?.coordinates || { type: 'Point', coordinates: [0, 0] }
        },
        verificationStatus: 'pending',
        isAvailable: false
        // No currentLocation – will be undefined initially
    };
    
    const provider = await ServiceProvider.create(providerData);
    await User.findByIdAndUpdate(req.user._id, { role: 'provider' });
    
    new ApiResponse(201, { provider }, 'Provider registration submitted for verification').send(res);
});

// @desc    Get provider profile
exports.getProfile = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOne({ user: req.user._id })
        .populate('services.category', 'name slug')
        .populate('services.subServices', 'name slug basePrice');
    if (!provider) throw new ApiError(404, 'Provider profile not found');
    new ApiResponse(200, { provider }, 'Profile fetched').send(res);
});

// @desc    Update provider profile
exports.updateProfile = asyncHandler(async (req, res) => {
    const allowedFields = ['businessName', 'bio', 'experience', 'workingHours', 'isAvailable', 'unavailableDates'];
    const updateData = {};
    Object.keys(req.body).forEach(key => { if (allowedFields.includes(key)) updateData[key] = req.body[key]; });
    const provider = await ServiceProvider.findOneAndUpdate({ user: req.user._id }, updateData, { new: true, runValidators: true });
    if (!provider) throw new ApiError(404, 'Provider profile not found');
    new ApiResponse(200, { provider }, 'Profile updated').send(res);
});

// @desc    Add service to provider
exports.addService = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    if (!provider) throw new ApiError(404, 'Provider profile not found');
    if (provider.verificationStatus !== 'verified') throw new ApiError(403, 'Please complete KYC verification first');
    if (provider.services.some(s => s.category.toString() === req.body.category)) throw new ApiError(400, 'Service already added');
    provider.services.push(req.body);
    await provider.save();
    new ApiResponse(201, { services: provider.services }, 'Service added').send(res);
});

// @desc    Update service
exports.updateService = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    if (!provider) throw new ApiError(404, 'Provider profile not found');
    const service = provider.services.id(req.params.serviceId);
    if (!service) throw new ApiError(404, 'Service not found');
    Object.assign(service, req.body);
    await provider.save();
    new ApiResponse(200, { services: provider.services }, 'Service updated').send(res);
});

// @desc    Remove service
exports.removeService = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    if (!provider) throw new ApiError(404, 'Provider profile not found');
    provider.services.id(req.params.serviceId).deleteOne();
    await provider.save();
    new ApiResponse(200, null, 'Service removed').send(res);
});

// @desc    Update service area
exports.updateServiceArea = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOneAndUpdate({ user: req.user._id }, { serviceArea: req.body }, { new: true });
    if (!provider) throw new ApiError(404, 'Provider profile not found');
    new ApiResponse(200, { serviceArea: provider.serviceArea }, 'Service area updated').send(res);
});

// @desc    Upload KYC documents
exports.uploadKYCDocuments = asyncHandler(async (req, res) => {
    console.log('========== UPLOAD KYC DOCUMENTS ==========');
    const { aadharNumber, panNumber } = req.body;
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    if (!provider) throw new ApiError(404, 'Provider profile not found');
    const files = req.files || {};
    if (files.aadharFront && files.aadharFront[0]) {
        const result = await uploadToCloudinary(files.aadharFront[0].buffer, 'gharseva/kyc-documents');
        const existingAadhar = provider.documents.find(doc => doc.type === 'aadhar');
        if (existingAadhar) {
            existingAadhar.frontImage = { url: result.secure_url, publicId: result.public_id };
            existingAadhar.documentNumber = aadharNumber || existingAadhar.documentNumber;
            existingAadhar.isVerified = false;
            existingAadhar.verifiedAt = null;
            existingAadhar.verifiedBy = null;
        } else {
            provider.documents.push({ type: 'aadhar', documentNumber: aadharNumber, frontImage: { url: result.secure_url, publicId: result.public_id }, isVerified: false });
        }
    }
    if (files.aadharBack && files.aadharBack[0]) {
        const result = await uploadToCloudinary(files.aadharBack[0].buffer, 'gharseva/kyc-documents');
        const existingAadhar = provider.documents.find(doc => doc.type === 'aadhar');
        if (existingAadhar) existingAadhar.backImage = { url: result.secure_url, publicId: result.public_id };
    }
    if (files.panFront && files.panFront[0]) {
        const result = await uploadToCloudinary(files.panFront[0].buffer, 'gharseva/kyc-documents');
        const existingPan = provider.documents.find(doc => doc.type === 'pan');
        if (existingPan) {
            existingPan.frontImage = { url: result.secure_url, publicId: result.public_id };
            existingPan.documentNumber = panNumber || existingPan.documentNumber;
            existingPan.isVerified = false;
        } else {
            provider.documents.push({ type: 'pan', documentNumber: panNumber, frontImage: { url: result.secure_url, publicId: result.public_id }, isVerified: false });
        }
    }
    if (provider.verificationStatus === 'rejected' || provider.verificationStatus === 'pending') provider.verificationStatus = 'pending';
    await provider.save();
    const Notification = require('../models/Notification');
    const adminUsers = await User.find({ role: 'admin' });
    for (const admin of adminUsers) {
        await Notification.create({
            recipient: admin._id, type: 'system', title: 'New KYC Documents Uploaded',
            message: `${provider.businessName || req.user.fullName} has uploaded KYC documents`,
            reference: { model: 'ServiceProvider', id: provider._id }, channels: { inApp: true, email: true }
        });
    }
    new ApiResponse(200, { documents: provider.documents, verificationStatus: provider.verificationStatus }, 'Documents uploaded successfully').send(res);
});

// @desc    Get provider verification status
exports.getVerificationStatus = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    if (!provider) throw new ApiError(404, 'Provider profile not found');
    const documents = { aadhar: provider.documents.find(d => d.type === 'aadhar') || null, pan: provider.documents.find(d => d.type === 'pan') || null };
    const hasAadhaar = !!documents.aadhar;
    const hasPAN = !!documents.pan;
    let isFullyVerified = false;
    let verificationMessage = '';
    if (provider.verificationStatus === 'verified') {
        if (hasAadhaar && hasPAN) isFullyVerified = true;
        else if (hasAadhaar && !hasPAN) verificationMessage = 'Please upload PAN card for full verification.';
        else if (!hasAadhaar && hasPAN) verificationMessage = 'Please upload Aadhaar card for full verification.';
    } else if (provider.verificationStatus === 'rejected') {
        verificationMessage = provider.verificationNote || 'Documents rejected. Please upload clear copies.';
    } else if (provider.verificationStatus === 'under_review') {
        verificationMessage = 'Documents under review.';
    } else {
        verificationMessage = 'Please upload KYC documents.';
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
exports.updateBankDetails = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOneAndUpdate({ user: req.user._id }, { bankDetails: req.body }, { new: true });
    if (!provider) throw new ApiError(404, 'Provider profile not found');
    new ApiResponse(200, { bankDetails: provider.bankDetails }, 'Bank details updated').send(res);
});

// @desc    Get provider stats
exports.getStats = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    if (!provider) throw new ApiError(404, 'Provider profile not found');
    const Booking = require('../models/Booking');
    const recentBookings = await Booking.find({ provider: provider._id }).sort('-createdAt').limit(5);
    const earningsSummary = await Booking.aggregate([
        { $match: { provider: provider._id, status: 'completed' } },
        { $group: { _id: { $month: '$createdAt' }, total: { $sum: '$pricing.total' }, count: { $sum: 1 } } },
        { $sort: { '_id': -1 } }, { $limit: 12 }
    ]);
    new ApiResponse(200, { stats: provider.stats, rating: provider.rating, recentBookings, earningsSummary }, 'Stats fetched').send(res);
});

// @desc    Get public provider profile
exports.getPublicProfile = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findById(req.params.id)
        .populate('user', 'firstName lastName avatar')
        .populate('services.category', 'name slug')
        .populate('services.subServices', 'name slug basePrice');
    if (!provider) throw new ApiError(404, 'Provider not found');
    const Review = require('../models/Review');
    const reviews = await Review.find({ provider: provider._id, status: 'approved' }).populate('customer', 'firstName lastName avatar').sort('-createdAt').limit(10);
    new ApiResponse(200, { provider, reviews }, 'Provider profile fetched').send(res);
});

// @desc    Search providers
exports.searchProviders = asyncHandler(async (req, res) => {
    const { latitude, longitude, radius = 10, service, pincode, city, page = 1, limit = 10 } = req.query;
    const query = { verificationStatus: 'verified', isAvailable: true };
    if (service) query['services.category'] = service;
    let locationFilter = {};
    if (latitude && longitude) {
        const lat = parseFloat(latitude), lng = parseFloat(longitude);
        locationFilter = { serviceArea: { $nearSphere: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: parseFloat(radius) * 1000 } } };
    } else if (pincode) query['serviceArea.pincodes'] = pincode;
    else if (city) query['serviceArea.cities'] = { $regex: new RegExp(`^${city}$`, 'i') };
    else return new ApiResponse(200, { providers: [], pagination: { page: 1, limit, total: 0, pages: 0 } }, 'No location criteria').send(res);
    Object.assign(query, locationFilter);
    const providers = await ServiceProvider.find(query).populate('user', 'firstName lastName avatar').populate('services.category', 'name slug').sort('-rating.average').skip((page-1)*limit).limit(parseInt(limit));
    const total = await ServiceProvider.countDocuments(query);
    new ApiResponse(200, { providers, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total/limit) } }, 'Providers fetched').send(res);
});

// @desc    Get provider notifications
exports.getNotifications = asyncHandler(async (req, res) => {
    const Notification = require('../models/Notification');
    const notifications = await Notification.find({ recipient: req.user._id }).sort('-createdAt').limit(50);
    const unreadCount = await Notification.countDocuments({ recipient: req.user._id, isRead: false });
    new ApiResponse(200, { notifications, unreadCount }, 'Notifications fetched').send(res);
});

// @desc    Mark notification read
exports.markNotificationRead = asyncHandler(async (req, res) => {
    const Notification = require('../models/Notification');
    const notification = await Notification.findOneAndUpdate({ _id: req.params.id, recipient: req.user._id }, { isRead: true, readAt: new Date() }, { new: true });
    if (!notification) throw new ApiError(404, 'Notification not found');
    new ApiResponse(200, { notification }, 'Marked as read').send(res);
});

// @desc    Update heartbeat
exports.updateHeartbeat = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    if (!provider) throw new ApiError(404, 'Provider profile not found');
    await ServiceProvider.updateOne({ _id: provider._id }, { $set: { lastActive: new Date() } });
    new ApiResponse(200, { lastActive: new Date() }, 'Heartbeat updated').send(res);
});

// @desc    Update live location
exports.updateLocation = asyncHandler(async (req, res) => {
    const { lat, lng } = req.body;
    if (!lat || !lng) throw new ApiError(400, 'Latitude and longitude required');
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    if (!provider) throw new ApiError(404, 'Provider profile not found');
    await ServiceProvider.updateOne(
        { _id: provider._id },
        { $set: { currentLocation: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)], updatedAt: new Date() }, lastActive: new Date() } }
    );
    const withinArea = await checkLocationInServiceArea(provider, lat, lng);
    if (!withinArea) return new ApiResponse(200, { withinServiceArea: false, message: 'Outside service area' }, 'Location updated outside area').send(res);
    new ApiResponse(200, { withinServiceArea: true, message: 'Location updated' }, 'Location updated').send(res);
});

// @desc    Get nearby providers for customer
exports.getNearbyProviders = asyncHandler(async (req, res) => {
    const { lat, lng, serviceCategory, radius = 50 } = req.query;
    if (!lat || !lng) throw new ApiError(400, 'Latitude and longitude required');
    const query = { verificationStatus: 'verified', isAvailable: true };
    if (serviceCategory) query['services.category'] = serviceCategory;
    const providers = await ServiceProvider.find(query).populate('user', 'firstName lastName avatar').lean();
    const results = providers.map(p => {
        let distance = null, withinRadius = false;
        if (p.serviceArea?.coordinates?.coordinates) {
            const [plng, plat] = p.serviceArea.coordinates.coordinates;
            distance = getDistanceFromLatLonInKm(parseFloat(lat), parseFloat(lng), plat, plng);
            withinRadius = distance <= radius;
        }
        return { id: p._id, businessName: p.businessName, ownerName: `${p.user.firstName} ${p.user.lastName}`, avatar: p.user.avatar?.url, distance: distance ? distance.toFixed(2) : null, withinRadius, rating: p.rating?.average || 0 };
    }).sort((a,b) => (parseFloat(a.distance) || Infinity) - (parseFloat(b.distance) || Infinity));
    new ApiResponse(200, { providers: results }, 'Nearby providers fetched').send(res);
});

// @desc    Get featured providers
exports.getFeaturedProviders = asyncHandler(async (req, res) => {
    const { limit = 20 } = req.query;
    const providers = await ServiceProvider.find({ verificationStatus: 'verified', isAvailable: true, 'stats.completedBookings': { $gt: 0 } })
        .populate('user', 'firstName lastName avatar phone email')
        .sort('-rating.average')
        .limit(parseInt(limit));
    const Wallet = require('../models/Wallet');
    const providerData = await Promise.all(providers.map(async (provider) => {
        const wallet = await Wallet.findOne({ user: provider.user._id });
        return {
            id: provider._id,
            businessName: provider.businessName || `${provider.user.firstName} ${provider.user.lastName}`,
            ownerName: `${provider.user.firstName} ${provider.user.lastName}`,
            avatar: provider.user.avatar?.url || `https://ui-avatars.com/api/?name=${encodeURIComponent(provider.businessName || provider.user.firstName)}&background=10b981&color=fff`,
            rating: provider.rating?.average || 0,
            reviewCount: provider.rating?.count || 0,
            isOnline: provider.isAvailable && provider.lastActive > new Date(Date.now() - 60 * 1000),
            isVerified: true,
            completedJobs: provider.stats?.completedBookings || 0,
            totalEarnings: wallet ? wallet.totalEarnings : 0,
            experienceYears: provider.experience?.years || 0
        };
    }));
    new ApiResponse(200, { providers: providerData }, 'Featured providers fetched').send(res);
});