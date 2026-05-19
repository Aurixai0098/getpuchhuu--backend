// controllers/adminController.js

const User = require('../models/User');
const Booking = require('../models/Booking');
const ServiceProvider = require('../models/ServiceProvider');
const Category = require('../models/Category');
const SubService = require('../models/SubService');
const Payment = require('../models/Payment');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const Settings = require('../models/Settings');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

// ✅ Helper function to round to 2 decimal places
const roundTo2 = (num) => Math.round(num * 100) / 100;

// @desc    Get admin dashboard stats
// @route   GET /api/v1/admin/dashboard
exports.getDashboardStats = asyncHandler(async (req, res) => {
    const now = new Date();
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const totalUsers = await User.countDocuments({ role: 'customer' });
    const totalProviders = await User.countDocuments({ role: 'provider' });
    const totalBookings = await Booking.countDocuments();
    const totalCategories = await Category.countDocuments();
    const totalServices = await SubService.countDocuments();

    const todayBookings = await Booking.countDocuments({ createdAt: { $gte: startOfToday } });
    const todayRevenue = await Booking.aggregate([
        { $match: { createdAt: { $gte: startOfToday }, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$pricing.total' } } }
    ]);

    const monthlyBookings = await Booking.countDocuments({ createdAt: { $gte: startOfMonth } });
    const monthlyRevenue = await Booking.aggregate([
        { $match: { createdAt: { $gte: startOfMonth }, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$pricing.total' } } }
    ]);

    const yearlyBookings = await Booking.countDocuments({ createdAt: { $gte: startOfYear } });
    const yearlyRevenue = await Booking.aggregate([
        { $match: { createdAt: { $gte: startOfYear }, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$pricing.total' } } }
    ]);

    const totalRevenue = await Booking.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$pricing.total' } } }
    ]);

    const commissionTotal = await Payment.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$commission.amount' } } }
    ]);

    const pendingWithdrawals = await WithdrawalRequest.aggregate([
        { $match: { status: 'pending' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const recentBookings = await Booking.find()
        .populate('customer', 'firstName lastName')
        .populate('provider', 'businessName')
        .sort('-createdAt')
        .limit(10);

    const stats = {
        counts: {
            users: totalUsers,
            providers: totalProviders,
            bookings: totalBookings,
            categories: totalCategories,
            services: totalServices
        },
        today: {
            bookings: todayBookings,
            revenue: roundTo2(todayRevenue[0]?.total || 0)
        },
        monthly: {
            bookings: monthlyBookings,
            revenue: roundTo2(monthlyRevenue[0]?.total || 0)
        },
        yearly: {
            bookings: yearlyBookings,
            revenue: roundTo2(yearlyRevenue[0]?.total || 0)
        },
        totalRevenue: roundTo2(totalRevenue[0]?.total || 0),
        platformCommission: roundTo2(commissionTotal[0]?.total || 0),
        pendingWithdrawals: roundTo2(pendingWithdrawals[0]?.total || 0),
        recentBookings
    };

    new ApiResponse(200, stats, 'Dashboard stats fetched successfully').send(res);
});

// @desc    Get revenue report
// @route   GET /api/v1/admin/reports/revenue
exports.getRevenueReport = asyncHandler(async (req, res) => {
    const { startDate, endDate, groupBy = 'day' } = req.query;
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    let groupFormat;
    switch (groupBy) {
        case 'day': groupFormat = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }; break;
        case 'month': groupFormat = { $dateToString: { format: '%Y-%m', date: '$createdAt' } }; break;
        case 'year': groupFormat = { $dateToString: { format: '%Y', date: '$createdAt' } }; break;
        default: groupFormat = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
    }

    const revenueData = await Booking.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, status: 'completed' } },
        {
            $group: {
                _id: groupFormat,
                revenue: { $sum: '$pricing.total' },
                bookings: { $sum: 1 },
                averageOrderValue: { $avg: '$pricing.total' }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    const formattedData = revenueData.map(item => ({
        period: item._id,
        revenue: roundTo2(item.revenue),
        bookings: item.bookings,
        averageOrderValue: roundTo2(item.averageOrderValue || 0)
    }));

    const totalRevenue = roundTo2(formattedData.reduce((sum, item) => sum + item.revenue, 0));
    const totalBookings = formattedData.reduce((sum, item) => sum + item.bookings, 0);
    const averageOrderValue = totalBookings > 0 ? roundTo2(totalRevenue / totalBookings) : 0;

    new ApiResponse(200, {
        data: formattedData,
        summary: { totalRevenue, totalBookings, averageOrderValue, period: { start: startDate, end: endDate } }
    }, 'Revenue report fetched successfully').send(res);
});

// @desc    Get provider earnings report
// @route   GET /api/v1/admin/reports/provider-earnings
exports.getProviderEarnings = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;

    const providerEarnings = await Payment.aggregate([
        { $match: { status: 'paid' } },
        {
            $group: {
                _id: '$provider',
                totalEarnings: { $sum: '$commission.providerEarning' },
                totalCommission: { $sum: '$commission.amount' },
                totalAmount: { $sum: '$amount' },
                transactionCount: { $sum: 1 }
            }
        },
        { $sort: { totalEarnings: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: parseInt(limit) }
    ]);

    const providerIds = providerEarnings.map(item => item._id);
    const providers = await ServiceProvider.find({ _id: { $in: providerIds } })
        .populate('user', 'firstName lastName email phone');

    const formattedEarnings = providerEarnings.map(item => {
        const provider = providers.find(p => p._id.toString() === item._id.toString());
        return {
            provider: provider || { _id: item._id },
            totalEarnings: roundTo2(item.totalEarnings),
            totalCommission: roundTo2(item.totalCommission),
            totalAmount: roundTo2(item.totalAmount),
            transactionCount: item.transactionCount
        };
    });

    const total = await Payment.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, count: { $sum: 1 } } }
    ]);

    new ApiResponse(200, {
        earnings: formattedEarnings,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: total[0]?.count || 0,
            pages: Math.ceil((total[0]?.count || 0) / limit)
        }
    }, 'Provider earnings fetched successfully').send(res);
});

// @desc    Get all users
// @route   GET /api/v1/admin/users
exports.getAllUsers = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, role, status } = req.query;
    const query = {};
    if (role) query.role = role;
    if (status) query.status = status;

    const users = await User.find(query)
        .select('-password')
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    new ApiResponse(200, {
        users,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    }, 'Users fetched successfully').send(res);
});

// @desc    Get user details
// @route   GET /api/v1/admin/users/:id
exports.getUserDetails = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id)
        .select('-password')
        .populate('addresses');
    if (!user) throw new ApiError(404, 'User not found');
    new ApiResponse(200, { user }, 'User details fetched successfully').send(res);
});

// @desc    Update user status
// @route   PATCH /api/v1/admin/users/:id/status
exports.updateUserStatus = asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    if (!status) throw new ApiError(400, 'Status is required');
    if (!['active', 'inactive', 'suspended'].includes(status)) throw new ApiError(400, 'Invalid status. Allowed: active, inactive, suspended');

    const user = await User.findByIdAndUpdate(
        req.params.id,
        { status, updatedAt: new Date() },
        { new: true, runValidators: true }
    ).select('-password');
    if (!user) throw new ApiError(404, 'User not found');

    await Notification.create({
        recipient: user._id,
        type: 'system',
        title: status === 'active' ? 'Account Activated' : 'Account Suspended',
        message: status === 'active'
            ? 'Your account has been activated. You can now access all features.'
            : 'Your account has been suspended. Please contact support for more information.',
        channels: { inApp: true, email: true }
    });

    new ApiResponse(200, { user }, 'User status updated successfully').send(res);
});

// @desc    Get all providers (for admin)
// @route   GET /api/v1/admin/providers
exports.getAllProviders = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, verificationStatus, isAvailable } = req.query;
    const query = {};
    if (verificationStatus) query.verificationStatus = verificationStatus;
    if (isAvailable !== undefined) query.isAvailable = isAvailable === 'true';

    const providers = await ServiceProvider.find(query)
        .populate('user', 'firstName lastName email phone status')
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const total = await ServiceProvider.countDocuments(query);

    new ApiResponse(200, {
        providers,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    }, 'Providers fetched successfully').send(res);
});

// @desc    Get all verification requests
// @route   GET /api/v1/admin/verifications
exports.getVerificationRequests = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status, accountStatus } = req.query;
    const query = {};
    if (status && status !== 'all') query.verificationStatus = status;

    let providers = await ServiceProvider.find(query)
        .populate('user', 'firstName lastName email phone avatar status')
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    if (accountStatus && accountStatus !== 'all') {
        providers = providers.filter(provider => provider.user?.status === accountStatus);
    }

    const verifications = providers.map(provider => ({
        _id: provider._id,
        businessName: provider.businessName,
        user: provider.user,
        documents: provider.documents || [],
        verificationStatus: provider.verificationStatus,
        verificationNote: provider.verificationNote,
        createdAt: provider.createdAt,
        experience: provider.experience,
        serviceArea: provider.serviceArea,
        bankDetails: provider.bankDetails
    }));

    new ApiResponse(200, {
        verifications,
        pagination: { page: parseInt(page), limit: parseInt(limit), total: verifications.length, pages: Math.ceil(verifications.length / limit) }
    }, 'Verification requests fetched successfully').send(res);
});

// @desc    Verify or reject provider KYC
// @route   PATCH /api/v1/admin/verifications/:id
exports.verifyProviderKYC = asyncHandler(async (req, res) => {
    const { status, note } = req.body || {};
    if (!status) throw new ApiError(400, 'Status is required');
    if (!['verified', 'rejected', 'under_review'].includes(status)) throw new ApiError(400, 'Invalid status');

    const provider = await ServiceProvider.findById(req.params.id);
    if (!provider) throw new ApiError(404, 'Provider not found');

    const hasAadhaar = provider.documents.some(doc => doc.type === 'aadhar');
    const hasPAN = provider.documents.some(doc => doc.type === 'pan');
    const uploadedDocs = [];
    if (hasAadhaar) uploadedDocs.push('Aadhaar Card');
    if (hasPAN) uploadedDocs.push('PAN Card');

    let notificationTitle = '', notificationMessage = '';

    if (status === 'verified') {
        if (!hasAadhaar && !hasPAN) throw new ApiError(400, 'Cannot verify: Provider has not uploaded any documents');

        if (hasAadhaar && !hasPAN) {
            notificationTitle = 'KYC Partially Verified';
            notificationMessage = 'Your Aadhaar card has been verified. However, PAN card is pending. You can now start accepting bookings with limited access.';
            provider.verificationStatus = 'verified';
            provider.verificationNote = 'Partially verified - Aadhaar verified, PAN pending';
        } else if (hasAadhaar && hasPAN) {
            notificationTitle = 'KYC Fully Verified';
            notificationMessage = `Your documents (${uploadedDocs.join(' and ')}) have been verified. You can now start accepting bookings.`;
            provider.verificationStatus = 'verified';
            provider.verificationNote = 'Fully verified - All documents verified';
        } else if (!hasAadhaar && hasPAN) {
            notificationTitle = 'KYC Partially Verified';
            notificationMessage = 'Your PAN card has been verified. However, Aadhaar card is pending. You can now start accepting bookings with limited access.';
            provider.verificationStatus = 'verified';
            provider.verificationNote = 'Partially verified - PAN verified, Aadhaar pending';
        }

        provider.verifiedAt = new Date();
        provider.documents.forEach(doc => {
            if (doc.type === 'aadhar' || doc.type === 'pan') {
                doc.isVerified = true;
                doc.verifiedAt = new Date();
                doc.verifiedBy = req.user._id;
            }
        });
        await User.findByIdAndUpdate(provider.user, { role: 'provider' });
    } else if (status === 'rejected') {
        provider.verificationStatus = 'rejected';
        provider.verificationNote = note || 'Your documents were rejected. Please upload clear copies.';
        provider.verifiedAt = null;
        notificationTitle = 'KYC Verification Rejected';
        notificationMessage = `Your KYC verification has been rejected. Reason: ${note || 'Please upload clear and valid documents.'}`;
    } else if (status === 'under_review') {
        provider.verificationStatus = 'under_review';
        provider.verificationNote = note || 'Your documents are under review';
        notificationTitle = 'KYC Documents Under Review';
        notificationMessage = `Your uploaded documents (${uploadedDocs.join(', ') || 'None'}) are under review by admin. We will notify you once verified.`;
    }

    await provider.save();

    await Notification.create({
        recipient: provider.user,
        type: status === 'verified' ? 'profile_verified' : status === 'rejected' ? 'profile_rejected' : 'system',
        title: notificationTitle,
        message: notificationMessage,
        reference: { model: 'ServiceProvider', id: provider._id },
        channels: { inApp: true, email: true }
    });

    new ApiResponse(200, {
        provider: {
            _id: provider._id,
            verificationStatus: provider.verificationStatus,
            verificationNote: provider.verificationNote,
            documents: provider.documents
        }
    }, `Provider ${status} successfully`).send(res);
});

// @desc    Get provider documents for KYC verification
// @route   GET /api/v1/admin/providers/:id/documents
exports.getProviderDocuments = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findById(req.params.id)
        .populate('user', 'firstName lastName email phone');
    if (!provider) throw new ApiError(404, 'Provider not found');

    const documents = {
        aadhar: provider.documents?.find(doc => doc.type === 'aadhar') || null,
        pan: provider.documents?.find(doc => doc.type === 'pan') || null,
        driving_license: provider.documents?.find(doc => doc.type === 'driving_license') || null,
        certificate: provider.documents?.find(doc => doc.type === 'certificate') || null,
        other: provider.documents?.filter(doc => doc.type === 'other') || []
    };

    new ApiResponse(200, {
        providerId: provider._id,
        businessName: provider.businessName,
        user: provider.user,
        documents,
        verificationStatus: provider.verificationStatus,
        verificationNote: provider.verificationNote,
        createdAt: provider.createdAt
    }, 'Provider documents fetched').send(res);
});

// @desc    Get all categories (for admin)
// @route   GET /api/v1/admin/categories
exports.getAllCategories = asyncHandler(async (req, res) => {
    const categories = await Category.find().populate('parent').sort('sortOrder');
    new ApiResponse(200, { categories }, 'Categories fetched successfully').send(res);
});

// @desc    Create category
// @route   POST /api/v1/admin/categories
exports.createCategory = asyncHandler(async (req, res) => {
    const category = await Category.create(req.body);
    new ApiResponse(201, { category }, 'Category created successfully').send(res);
});

// @desc    Update category
// @route   PUT /api/v1/admin/categories/:id
exports.updateCategory = asyncHandler(async (req, res) => {
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!category) throw new ApiError(404, 'Category not found');
    new ApiResponse(200, { category }, 'Category updated successfully').send(res);
});

// @desc    Delete category
// @route   DELETE /api/v1/admin/categories/:id
exports.deleteCategory = asyncHandler(async (req, res) => {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) throw new ApiError(404, 'Category not found');
    new ApiResponse(200, null, 'Category deleted successfully').send(res);
});

// @desc    Get all services (for admin)
// @route   GET /api/v1/admin/services
exports.getAllServices = asyncHandler(async (req, res) => {
    const services = await SubService.find().populate('category', 'name slug').sort('sortOrder');
    new ApiResponse(200, { services }, 'Services fetched successfully').send(res);
});

// @desc    Create service
// @route   POST /api/v1/admin/services
exports.createService = asyncHandler(async (req, res) => {
    const service = await SubService.create(req.body);
    new ApiResponse(201, { service }, 'Service created successfully').send(res);
});

// @desc    Update service
// @route   PUT /api/v1/admin/services/:id
exports.updateService = asyncHandler(async (req, res) => {
    const service = await SubService.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!service) throw new ApiError(404, 'Service not found');
    new ApiResponse(200, { service }, 'Service updated successfully').send(res);
});

// @desc    Delete service
// @route   DELETE /api/v1/admin/services/:id
exports.deleteService = asyncHandler(async (req, res) => {
    const service = await SubService.findByIdAndDelete(req.params.id);
    if (!service) throw new ApiError(404, 'Service not found');
    new ApiResponse(200, null, 'Service deleted successfully').send(res);
});

// @desc    Get all bookings (for admin)
// @route   GET /api/v1/admin/bookings
exports.getAllBookings = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status } = req.query;
    const query = {};
    if (status) query.status = status;

    const bookings = await Booking.find(query)
        .populate('customer', 'firstName lastName email phone')
        .populate('provider', 'businessName user')
        .populate('category', 'name')
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const total = await Booking.countDocuments(query);

    new ApiResponse(200, {
        bookings,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    }, 'Bookings fetched successfully').send(res);
});

// @desc    Get commission settings
// @route   GET /api/v1/admin/settings/commission
exports.getCommissionSettings = asyncHandler(async (req, res) => {
    let setting = await Settings.findOne({ key: 'commission' });
    if (!setting) setting = { key: 'commission', value: 20 };
    new ApiResponse(200, { commission: setting.value }, 'Commission settings fetched').send(res);
});

// @desc    Update commission settings
// @route   PUT /api/v1/admin/settings/commission
exports.updateCommissionSettings = asyncHandler(async (req, res) => {
    const { commissionPercentage } = req.body;
    if (commissionPercentage < 0 || commissionPercentage > 100) throw new ApiError(400, 'Commission percentage must be between 0 and 100');
    const setting = await Settings.findOneAndUpdate(
        { key: 'commission' },
        { key: 'commission', value: commissionPercentage },
        { upsert: true, new: true }
    );
    new ApiResponse(200, { commission: setting.value }, 'Commission settings updated').send(res);
});

// @desc    Get all withdrawal requests (for admin)
// @route   GET /api/v1/admin/withdrawals
exports.getAllWithdrawals = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;

    const withdrawals = await WithdrawalRequest.find(query)
        .populate('provider', 'firstName lastName email phone')
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const total = await WithdrawalRequest.countDocuments(query);

    new ApiResponse(200, {
        withdrawals,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    }, 'Withdrawals fetched successfully').send(res);
});

// @desc    Approve withdrawal request
// @route   PATCH /api/v1/admin/withdrawals/:id/approve
exports.approveWithdrawal = asyncHandler(async (req, res) => {
    const { transactionId, adminNote } = req.body || {};
    if (!transactionId) throw new ApiError(400, 'Transaction ID is required');

    const withdrawal = await WithdrawalRequest.findById(req.params.id);
    if (!withdrawal) throw new ApiError(404, 'Withdrawal request not found');
    if (withdrawal.status !== 'pending') throw new ApiError(400, 'Withdrawal request already processed');

    withdrawal.status = 'approved';
    withdrawal.processedAt = new Date();
    withdrawal.transactionId = transactionId;
    withdrawal.adminNote = adminNote;
    await withdrawal.save();

    const Wallet = require('../models/Wallet');
    const wallet = await Wallet.findOne({ user: withdrawal.provider });
    if (wallet) {
        wallet.balance = roundTo2(wallet.balance - withdrawal.amount);
        wallet.totalWithdrawals = roundTo2(wallet.totalWithdrawals + withdrawal.amount);
        wallet.transactions.push({
            type: 'debit',
            amount: withdrawal.amount,
            description: `Withdrawal request approved - ${withdrawal._id}`,
            balance: wallet.balance,
            status: 'completed'
        });
        await wallet.save();
    }

    new ApiResponse(200, { withdrawal }, 'Withdrawal approved successfully').send(res);
});

// @desc    Reject withdrawal request
// @route   PATCH /api/v1/admin/withdrawals/:id/reject
exports.rejectWithdrawal = asyncHandler(async (req, res) => {
    const { adminNote } = req.body || {};
    const withdrawal = await WithdrawalRequest.findById(req.params.id);
    if (!withdrawal) throw new ApiError(404, 'Withdrawal request not found');
    if (withdrawal.status !== 'pending') throw new ApiError(400, 'Withdrawal request already processed');

    withdrawal.status = 'rejected';
    withdrawal.processedAt = new Date();
    withdrawal.adminNote = adminNote;
    await withdrawal.save();

    new ApiResponse(200, { withdrawal }, 'Withdrawal rejected successfully').send(res);
});

// ========== EARNINGS & RATINGS ENDPOINTS ==========

// @desc    Get list of providers with earnings summary
// @route   GET /api/v1/admin/provider-earnings
exports.getProviderEarningsList = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search = '' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let matchCondition = {};
    if (search) {
        const providerIds = await ServiceProvider.find({ businessName: { $regex: search, $options: 'i' } }).distinct('_id');
        const users = await User.find({
            $or: [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ]
        }).select('_id');
        const userIds = users.map(u => u._id);
        const providerIdsFromUsers = await ServiceProvider.find({ user: { $in: userIds } }).distinct('_id');
        const allProviderIds = [...new Set([...providerIds, ...providerIdsFromUsers])];
        if (allProviderIds.length === 0) {
            return new ApiResponse(200, { providers: [], pagination: { page: pageNum, limit: limitNum, total: 0, pages: 0 }, summary: { totalEarnings: 0, totalBookings: 0, avgRating: 0 } }, 'Providers fetched').send(res);
        }
        matchCondition._id = { $in: allProviderIds };
    }

    const providers = await ServiceProvider.find(matchCondition)
        .populate('user', 'firstName lastName email avatar')
        .skip(skip)
        .limit(limitNum)
        .sort('-createdAt');

    const providerIds = providers.map(p => p._id);
    const earningsMap = new Map();
    const ratingMap = new Map();

    if (providerIds.length > 0) {
        const earnings = await Booking.aggregate([
            { $match: { provider: { $in: providerIds }, status: 'completed' } },
            { $group: { _id: '$provider', totalEarnings: { $sum: '$pricing.total' }, bookingCount: { $sum: 1 } } }
        ]);
        earnings.forEach(e => earningsMap.set(e._id.toString(), { totalEarnings: e.totalEarnings, bookingCount: e.bookingCount }));

        const Review = require('../models/Review');
        const ratings = await Review.aggregate([
            { $match: { provider: { $in: providerIds }, status: 'approved' } },
            { $group: { _id: '$provider', avgRating: { $avg: '$rating.overall' } } }
        ]);
        ratings.forEach(r => ratingMap.set(r._id.toString(), r.avgRating));
    }

    const providerList = providers.map(p => {
        const earnings = earningsMap.get(p._id.toString()) || { totalEarnings: 0, bookingCount: 0 };
        return {
            id: p._id,
            businessName: p.businessName || (p.user ? `${p.user.firstName} ${p.user.lastName}` : 'N/A'),
            ownerName: p.user ? `${p.user.firstName} ${p.user.lastName}` : 'N/A',
            email: p.user?.email || '',
            avatar: p.user?.avatar || null,
            totalEarnings: roundTo2(earnings.totalEarnings),
            totalBookings: earnings.bookingCount,
            avgRating: ratingMap.get(p._id.toString()) || 0
        };
    });

    const totalEarnings = providerList.reduce((sum, p) => sum + p.totalEarnings, 0);
    const totalBookings = providerList.reduce((sum, p) => sum + p.totalBookings, 0);
    const avgRating = providerList.length ? providerList.reduce((sum, p) => sum + p.avgRating, 0) / providerList.length : 0;
    const total = await ServiceProvider.countDocuments(matchCondition);

    new ApiResponse(200, {
        providers: providerList,
        pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
        summary: { totalEarnings: roundTo2(totalEarnings), totalBookings, avgRating: roundTo2(avgRating) }
    }, 'Provider earnings list fetched').send(res);
});

// @desc    Get detailed earnings & rating breakdown for a specific provider
// @route   GET /api/v1/admin/provider-earnings/:providerId
exports.getProviderEarningsDetails = asyncHandler(async (req, res) => {
    const { providerId } = req.params;
    const provider = await ServiceProvider.findById(providerId).populate('user', 'firstName lastName email avatar');
    if (!provider) throw new ApiError(404, 'Provider not found');

    const earningsByService = await Booking.aggregate([
        { $match: { provider: provider._id, status: 'completed' } },
        { $lookup: { from: 'subservices', localField: 'items.service', foreignField: '_id', as: 'serviceDetails' } },
        { $unwind: { path: '$serviceDetails', preserveNullAndEmptyArrays: true } },
        { $group: {
            _id: { $ifNull: ['$serviceDetails.name', 'Unknown'] },
            amount: { $sum: '$pricing.total' },
            bookings: { $sum: 1 }
        } },
        { $project: { serviceName: '$_id', amount: 1, bookings: 1, percentage: { $multiply: [{ $divide: ['$amount', { $sum: '$amount' }] }, 100] } } }
    ]);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    let monthlyTrend = await Booking.aggregate([
        { $match: { provider: provider._id, status: 'completed', createdAt: { $gte: sixMonthsAgo } } },
        { $group: { _id: { $dateToString: { format: '%b', date: '$createdAt' } }, earnings: { $sum: '$pricing.total' } } },
        { $sort: { _id: 1 } }
    ]);
    const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    monthlyTrend.sort((a, b) => monthOrder.indexOf(a._id) - monthOrder.indexOf(b._id));

    const recentBookings = await Booking.find({ provider: provider._id, status: 'completed' })
        .sort('-createdAt')
        .limit(5)
        .select('bookingId items pricing createdAt');
    const formattedRecentBookings = recentBookings.map(b => ({
        id: b.bookingId,
        service: b.items[0]?.serviceName || 'Unknown',
        amount: b.pricing.total,
        date: b.createdAt
    }));

    const earningsResult = await Booking.aggregate([
        { $match: { provider: provider._id, status: 'completed' } },
        { $group: { _id: null, totalEarnings: { $sum: '$pricing.total' }, totalBookings: { $sum: 1 } } }
    ]);

    const Review = require('../models/Review');
    const ratingResult = await Review.aggregate([
        { $match: { provider: provider._id, status: 'approved' } },
        { $group: { _id: null, avgRating: { $avg: '$rating.overall' } } }
    ]);

    new ApiResponse(200, {
        id: provider._id,
        businessName: provider.businessName,
        email: provider.user?.email,
        avatar: provider.user?.avatar,
        totalEarnings: roundTo2(earningsResult[0]?.totalEarnings || 0),
        totalBookings: earningsResult[0]?.totalBookings || 0,
        avgRating: ratingResult[0]?.avgRating || 0,
        earningsByService: earningsByService.map(e => ({
            serviceName: e.serviceName,
            amount: roundTo2(e.amount),
            bookings: e.bookings,
            percentage: roundTo2(e.percentage || 0)
        })),
        monthlyTrend: monthlyTrend.map(m => ({ month: m._id, earnings: roundTo2(m.earnings) })),
        recentBookings: formattedRecentBookings
    }, 'Provider earnings details fetched').send(res);
});

// ========== PROVIDER ONLINE STATUS ENDPOINT ==========

// @desc    Get provider online/offline status list with location and avatar
// @route   GET /api/v1/admin/providers/status
exports.getProviderStatusList = asyncHandler(async (req, res) => {
    const providers = await ServiceProvider.find()
        .populate('user', 'firstName lastName email phone avatar')
        .select('businessName serviceArea isAvailable updatedAt lastActive user');

    const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);
    const statusList = providers.map(provider => {
        const user = provider.user;
        let isOnline = false;
        if (provider.isAvailable === true && provider.lastActive) {
            const lastActive = new Date(provider.lastActive);
            isOnline = lastActive > oneMinuteAgo;
        }

        let location = null;
        if (provider.serviceArea) {
            if (provider.serviceArea.cities?.length) {
                location = provider.serviceArea.cities[0];
            } else if (provider.serviceArea.pincodes?.length) {
                location = `Pincode: ${provider.serviceArea.pincodes[0]}`;
            } else if (provider.serviceArea.coordinates) {
                location = `Lat: ${provider.serviceArea.coordinates.latitude}, Lng: ${provider.serviceArea.coordinates.longitude}`;
            }
        }
        return {
            id: provider._id,
            name: provider.businessName || (user ? `${user.firstName} ${user.lastName}` : 'N/A'),
            owner: user ? `${user.firstName} ${user.lastName}` : 'N/A',
            email: user?.email || '',
            phone: user?.phone || '',
            avatar: user?.avatar?.url || null,
            online: isOnline,
            lastSeen: provider.lastActive || provider.updatedAt || provider.createdAt,
            location: location
        };
    });

    new ApiResponse(200, { providers: statusList }, 'Provider status list fetched').send(res);
});

// ========== NEW FUNCTIONS FOR USER STATS, UPDATE & NOTIFICATIONS ==========

// @desc    Get user statistics (wallet, spending, bookings)
// @route   GET /api/v1/admin/users/:id/stats
exports.getUserStats = asyncHandler(async (req, res) => {
    const userId = req.params.id;
    
    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, 'User not found');
    
    // Wallet balance
    const Wallet = require('../models/Wallet');
    const wallet = await Wallet.findOne({ user: userId });
    const walletBalance = wallet ? roundTo2(wallet.balance) : 0;
    
    // Total spent from completed bookings
    const bookings = await Booking.find({ customer: userId });
    let totalSpent = 0;
    let totalCompleted = 0, totalCancelled = 0, totalPending = 0;
    const recentBookings = [];
    
    for (const booking of bookings) {
        if (booking.status === 'completed') {
            totalCompleted++;
            totalSpent += booking.pricing.total;
            recentBookings.push({
                _id: booking._id,
                bookingId: booking.bookingId,
                status: booking.status,
                amount: booking.pricing.total,
                date: booking.createdAt
            });
        } else if (booking.status === 'cancelled') {
            totalCancelled++;
        } else if (booking.status === 'pending') {
            totalPending++;
        }
    }
    
    // Sort recent bookings by date desc
    recentBookings.sort((a, b) => new Date(b.date) - new Date(a.date));
    const topRecent = recentBookings.slice(0, 10);
    
    new ApiResponse(200, {
        walletBalance: roundTo2(walletBalance),
        totalSpent: roundTo2(totalSpent),
        totalCompleted,
        totalCancelled,
        totalPending,
        recentBookings: topRecent
    }, 'User stats fetched successfully').send(res);
});

// @desc    Update user by admin (firstName, lastName, phone)
// @route   PUT /api/v1/admin/users/:id
exports.updateUserByAdmin = asyncHandler(async (req, res) => {
    const { firstName, lastName, phone } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) throw new ApiError(404, 'User not found');
    
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone) user.phone = phone;
    
    await user.save();
    
    new ApiResponse(200, {
        user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            role: user.role,
            isActive: user.status === 'active'
        }
    }, 'User updated successfully').send(res);
});

// @desc    Send push notification (admin to user)
// @route   POST /api/v1/admin/notifications/push
exports.sendPushNotification = asyncHandler(async (req, res) => {
    const { targetType, targetId, message } = req.body;
    const Notification = require('../models/Notification');
    
    let recipientId = null;
    if (targetType === 'specific_user') {
        recipientId = targetId;
    } else if (targetType === 'all_users') {
        // For all users, you might loop or send to a special channel
        // Here we simply return success (you can implement bulk later)
        return new ApiResponse(200, null, 'Push notification sent to all users (bulk not implemented)').send(res);
    } else {
        throw new ApiError(400, 'Invalid target type');
    }
    
    const user = await User.findById(recipientId);
    if (!user) throw new ApiError(404, 'User not found');
    
    await Notification.create({
        recipient: recipientId,
        type: 'admin_message',
        title: 'Admin Notification',
        message: message,
        channels: { inApp: true, push: true, email: false }
    });
    
    new ApiResponse(200, null, 'Push notification sent successfully').send(res);
});

// @desc    Send SMS alert (admin to user)
// @route   POST /api/v1/admin/notifications/sms
exports.sendSmsAlert = asyncHandler(async (req, res) => {
    const { targetType, targetId, message } = req.body;
    
    if (targetType !== 'specific_user') {
        throw new ApiError(400, 'Only specific_user SMS is supported currently');
    }
    
    const user = await User.findById(targetId);
    if (!user) throw new ApiError(404, 'User not found');
    if (!user.phone) throw new ApiError(400, 'User has no phone number');
    
    // Integrate your SMS gateway here (Twilio, MSG91, etc.)
    // For now, we just log and return success
    console.log(`📱 SMS to ${user.phone}: ${message}`);
    
    // Example using Twilio (uncomment if you have Twilio configured)
    /*
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
    const client = require('twilio')(accountSid, authToken);
    await client.messages.create({
        body: message,
        to: `+91${user.phone}`,
        from: twilioPhone
    });
    */
    
    new ApiResponse(200, null, 'SMS alert sent successfully').send(res);
});