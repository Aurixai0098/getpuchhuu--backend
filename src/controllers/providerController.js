// controllers/providerController.js
const ServiceProvider = require('../models/ServiceProvider');
const SubService = require('../models/SubService');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { uploadToCloudinary } = require('../config/cloudinary');
const slugify = require('slugify');

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

// @desc    Register as service provider (complete multi-step registration)
exports.registerProvider = asyncHandler(async (req, res) => {
    const existingProvider = await ServiceProvider.findOne({ user: req.user._id });
    if (existingProvider) throw new ApiError(400, 'You are already registered as a service provider');

    // Parse JSON strings sent from frontend (because FormData sends strings)
    const services = typeof req.body.services === 'string' ? JSON.parse(req.body.services) : req.body.services;
    const serviceArea = typeof req.body.serviceArea === 'string' ? JSON.parse(req.body.serviceArea) : req.body.serviceArea;
    const workingHours = typeof req.body.workingHours === 'string' ? JSON.parse(req.body.workingHours) : req.body.workingHours;
    const bankDetails = typeof req.body.bankDetails === 'string' ? JSON.parse(req.body.bankDetails) : req.body.bankDetails;
    const experience = typeof req.body.experience === 'string' ? JSON.parse(req.body.experience) : req.body.experience;

    const { fullName, dateOfBirth, gender, isAvailable, emergencyServiceAvailable, bio } = req.body;

    // Validate full name
    if (!fullName || fullName.trim() === '') {
        throw new ApiError(400, 'Full name is required for provider registration');
    }

    // Split full name into first and last name
    const nameParts = fullName.trim().split(' ') || [];
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // 1. Update User model with personal info and avatar
    const userUpdate = {
        firstName,
        lastName,
        gender,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null
    };
    if (req.files?.avatar && req.files.avatar[0]) {
        const avatarResult = await uploadToCloudinary(req.files.avatar[0].buffer, 'gharseva/avatars');
        userUpdate.avatar = { url: avatarResult.secure_url, publicId: avatarResult.public_id };
    }
    await User.findByIdAndUpdate(req.user._id, userUpdate);

    // 2. Prepare documents array with proper error handling
    const documents = [];

    if (req.files?.aadharFront && req.files.aadharFront[0]) {
        try {
            const frontResult = await uploadToCloudinary(req.files.aadharFront[0].buffer, 'gharseva/kyc-documents');
            documents.push({
                type: 'aadhar',
                frontImage: { url: frontResult.secure_url, publicId: frontResult.public_id },
                isVerified: false
            });
            console.log('✅ Aadhaar front uploaded');
        } catch (err) {
            console.error('❌ Aadhaar front upload failed:', err.message);
            throw new ApiError(500, 'Aadhaar front image upload failed. Please try again.');
        }
    }
    if (req.files?.aadharBack && req.files.aadharBack[0]) {
        try {
            const backResult = await uploadToCloudinary(req.files.aadharBack[0].buffer, 'gharseva/kyc-documents');
            const existingAadhar = documents.find(d => d.type === 'aadhar');
            if (existingAadhar) {
                existingAadhar.backImage = { url: backResult.secure_url, publicId: backResult.public_id };
            } else {
                documents.push({
                    type: 'aadhar',
                    backImage: { url: backResult.secure_url, publicId: backResult.public_id },
                    isVerified: false
                });
            }
            console.log('✅ Aadhaar back uploaded');
        } catch (err) {
            console.error('❌ Aadhaar back upload failed:', err.message);
            throw new ApiError(500, 'Aadhaar back image upload failed. Please try again.');
        }
    }
    if (req.files?.panFront && req.files.panFront[0]) {
        try {
            const panResult = await uploadToCloudinary(req.files.panFront[0].buffer, 'gharseva/kyc-documents');
            documents.push({
                type: 'pan',
                frontImage: { url: panResult.secure_url, publicId: panResult.public_id },
                isVerified: false
            });
            console.log('✅ PAN card uploaded');
        } catch (err) {
            console.error('❌ PAN upload failed:', err.message);
            throw new ApiError(500, 'PAN card image upload failed. Please try again.');
        }
    }

    // 3. Prepare service area (with address fields)
    const finalServiceArea = {
        ...serviceArea,
        coordinates: serviceArea?.coordinates || { type: 'Point', coordinates: [0, 0] },
        cities: serviceArea?.city ? [serviceArea.city] : [],
        pincodes: serviceArea?.pincode ? [serviceArea.pincode] : [],
        radius: serviceArea?.radius || 10
    };
    if (req.body.currentAddress && !finalServiceArea.address) {
        finalServiceArea.address = req.body.currentAddress;
    }

    // 4. Business name – strong fallback
    let businessName = req.body.businessName;
    if (!businessName || businessName === 'undefined\'s Services' || businessName.includes('undefined')) {
        businessName = fullName ? `${fullName}'s Services` : 'Service Provider';
    }

    let providerBio = bio || '';
    if (emergencyServiceAvailable === 'true' || emergencyServiceAvailable === true) {
        providerBio += (providerBio ? ' | ' : '') + 'Emergency Service Available';
    }

    const providerData = {
        user: req.user._id,
        businessName,
        bio: providerBio,
        experience: experience || { years: 0, description: '' },
        services: services || [],
        workingHours: workingHours || getDefaultWorkingHours(),
        serviceArea: finalServiceArea,
        documents: documents.length ? documents : [],
        bankDetails: bankDetails || {},
        verificationStatus: 'pending',
        isAvailable: isAvailable === 'true' || isAvailable === true
    };

    const provider = await ServiceProvider.create(providerData);
    await User.findByIdAndUpdate(req.user._id, { role: 'provider' });

    console.log(`✅ Provider registered with ${documents.length} document(s)`);
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

// ✅ Create custom service (provider adds a new sub-service with image)
// ✅ Robust slug uniqueness with counter
exports.createCustomService = asyncHandler(async (req, res) => {
    const { name, category, basePrice, description } = req.body;
    
    if (!name || !category || !basePrice) {
        throw new ApiError(400, 'Name, category and base price are required');
    }
    if (isNaN(basePrice) || basePrice <= 0) {
        throw new ApiError(400, 'Base price must be a positive number');
    }

    let imageUrl = null;
    let imagePublicId = null;
    if (req.file) {
        const result = await uploadToCloudinary(req.file.buffer, 'gharseva/services');
        imageUrl = result.secure_url;
        imagePublicId = result.public_id;
    }

    // Generate unique slug with incremental suffix
    let baseSlug = slugify(name, { lower: true, strict: true });
    let slug = baseSlug;
    let counter = 1;
    
    while (true) {
        const existing = await SubService.findOne({ slug });
        if (!existing) break;
        slug = `${baseSlug}-${counter}`;
        counter++;
        if (counter > 100) {
            // fallback to timestamp (extremely rare)
            slug = `${baseSlug}-${Date.now()}`;
            break;
        }
    }

    const newService = await SubService.create({
        name,
        slug,
        category,
        basePrice: parseFloat(basePrice),
        description: description || name,
        shortDescription: description || name,
        isActive: true,
        isFeatured: false,
        pricingType: 'fixed',
        priceUnit: 'per_service',
        estimatedDuration: { min: 30, max: 60 },
        includes: [],
        excludes: [],
        requirements: [],
        tags: [],
        images: imageUrl ? [{ url: imageUrl, publicId: imagePublicId, caption: name }] : []
    });

    new ApiResponse(201, { service: newService }, 'Custom service created successfully').send(res);
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

// @desc    Get public provider profile (used by customer)
exports.getPublicProfile = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findById(req.params.id)
        .populate('user', 'firstName lastName avatar phone email')
        .populate('services.category', 'name slug')
        .populate('services.subServices', 'name slug basePrice');
    if (!provider) throw new ApiError(404, 'Provider not found');
    const Review = require('../models/Review');
    const reviews = await Review.find({ provider: provider._id, status: 'approved' }).populate('customer', 'firstName lastName avatar').sort('-createdAt').limit(10);
    new ApiResponse(200, { provider, reviews }, 'Provider profile fetched').send(res);
});

// ========== ✅ UPDATED searchProviders – includes real serviceId ==========
// @desc    Search providers (for customer)
exports.searchProviders = asyncHandler(async (req, res) => {
    const { latitude, longitude, radius = 10, service, pincode, city, page = 1, limit = 10 } = req.query;
    const query = { verificationStatus: 'verified', isAvailable: true };
    
    // Filter by service category if provided
    if (service) query['services.category'] = service;
    
    // Build location filter only if at least one location criteria is provided
    let locationFilter = {};
    let hasLocation = false;
    
    if (latitude && longitude) {
        const lat = parseFloat(latitude), lng = parseFloat(longitude);
        locationFilter = { serviceArea: { $nearSphere: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: parseFloat(radius) * 1000 } } };
        hasLocation = true;
    } else if (pincode) {
        query['serviceArea.pincodes'] = pincode;
        hasLocation = true;
    } else if (city) {
        query['serviceArea.cities'] = { $regex: new RegExp(`^${city}$`, 'i') };
        hasLocation = true;
    }
    
    // If neither location nor service category is provided, return empty (optional)
    if (!hasLocation && !service) {
        return new ApiResponse(200, { providers: [], pagination: { page: 1, limit, total: 0, pages: 0 } }, 'No location or service criteria').send(res);
    }
    
    // Combine query and location filter (if any)
    const finalQuery = hasLocation ? { ...query, ...locationFilter } : query;
    
    const providers = await ServiceProvider.find(finalQuery)
        .populate('user', 'firstName lastName avatar')
        .populate('services.subServices', 'basePrice name')  // populate to get min price
        .populate('services.category', 'name slug')
        .sort('-rating.average')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));
    
    // Transform provider data for frontend
    const transformedProviders = providers.map(provider => {
        // Calculate minimum price from all subServices across all categories
        let minPrice = Infinity;
        if (provider.services && provider.services.length > 0) {
            for (const svc of provider.services) {
                if (svc.subServices && svc.subServices.length) {
                    const prices = svc.subServices.map(sub => sub.basePrice);
                    const localMin = Math.min(...prices);
                    if (localMin < minPrice) minPrice = localMin;
                }
            }
        }
        if (minPrice === Infinity) minPrice = 0;
        
        const isOnline = provider.isAvailable && (new Date() - new Date(provider.lastActive) < 60000);
        const avgRating = provider.rating?.average || 0;
        const reviewCount = provider.rating?.count || 0;
        
        // Get first city from serviceArea (if any)
        const location = provider.serviceArea?.cities?.length ? provider.serviceArea.cities[0] : null;
        
        // Build servicesList from subServices names (for card display)
        let servicesList = [];
        let firstServiceId = null;
        if (provider.services && provider.services.length > 0) {
            for (const svc of provider.services) {
                if (svc.subServices && svc.subServices.length) {
                    const names = svc.subServices.map(sub => sub.name);
                    servicesList.push(...names);
                    // Take the first sub-service ID for direct booking
                    if (!firstServiceId && svc.subServices[0]) {
                        firstServiceId = svc.subServices[0]._id;
                    }
                }
            }
        }
        if (servicesList.length === 0) servicesList = ['Tap Repair', 'Pipe Fixing', 'Bathroom Fitting'];
        
        return {
            id: provider._id,
            businessName: provider.businessName,
            ownerName: provider.user ? `${provider.user.firstName} ${provider.user.lastName}` : '',
            avatar: provider.user?.avatar?.url || null,
            rating: { average: avgRating, count: reviewCount },
            isVerified: provider.verificationStatus === 'verified',
            isOnline,
            minPrice,
            location,
            experience: provider.experience?.years || 0,
            servicesList: servicesList,
            serviceId: firstServiceId,   // ✅ REAL SUB-SERVICE ID
        };
    });
    
    const total = await ServiceProvider.countDocuments(finalQuery);
    
    new ApiResponse(200, {
        providers: transformedProviders,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    }, 'Providers fetched').send(res);
});
// ========== END OF UPDATED searchProviders ==========

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

// @desc    Update heartbeat (online status)
exports.updateHeartbeat = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    if (!provider) throw new ApiError(404, 'Provider profile not found');
    await ServiceProvider.updateOne({ _id: provider._id }, { $set: { lastActive: new Date() } });
    new ApiResponse(200, { lastActive: new Date() }, 'Heartbeat updated').send(res);
});

// @desc    Update live location (for provider matching)
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

// @desc    Get featured providers (for home page)
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