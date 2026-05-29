// controllers/userController.js

const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { uploadToCloudinary } = require('../config/cloudinary');

// @desc    Update user profile
// @route   PUT /api/v1/users/profile
exports.updateProfile = asyncHandler(async (req, res) => {
    const { firstName, lastName, gender, dateOfBirth } = req.body;
    
    const user = await User.findById(req.user._id);
    
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (gender) user.gender = gender;
    if (dateOfBirth) user.dateOfBirth = dateOfBirth;
    
    await user.save();
    
    new ApiResponse(200, { user }, 'Profile updated successfully').send(res);
});

// @desc    Upload/Update user avatar
// @route   POST /api/v1/users/avatar
exports.uploadAvatar = asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new ApiError(400, 'Please upload an image file');
    }
    
    const user = await User.findById(req.user._id);
    if (!user) {
        throw new ApiError(404, 'User not found');
    }
    
    // Delete old avatar from Cloudinary if exists
    if (user.avatar?.publicId) {
        const cloudinary = require('cloudinary').v2;
        await cloudinary.uploader.destroy(user.avatar.publicId);
    }
    
    // Upload to Cloudinary
    const result = await uploadToCloudinary(req.file.buffer, 'gharseva/avatars');
    
    // Update user avatar
    user.avatar = {
        url: result.secure_url,
        publicId: result.public_id
    };
    
    await user.save();
    
    new ApiResponse(200, { 
        avatar: user.avatar,
        message: 'Avatar updated successfully'
    }, 'Avatar uploaded successfully').send(res);
});

// @desc    Remove user avatar
// @route   DELETE /api/v1/users/avatar
exports.removeAvatar = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user) {
        throw new ApiError(404, 'User not found');
    }
    
    // Delete from Cloudinary
    if (user.avatar?.publicId) {
        const cloudinary = require('cloudinary').v2;
        await cloudinary.uploader.destroy(user.avatar.publicId);
    }
    
    user.avatar = undefined;
    await user.save();
    
    new ApiResponse(200, null, 'Avatar removed successfully').send(res);
});

// @desc    Add address
// @route   POST /api/v1/users/addresses
exports.addAddress = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    
    if (req.body.isDefault || user.addresses.length === 0) {
        user.addresses.forEach(addr => {
            addr.isDefault = false;
        });
    }
    
    user.addresses.push(req.body);
    await user.save();
    
    new ApiResponse(201, { addresses: user.addresses }, 'Address added successfully').send(res);
});

// @desc    Update address
// @route   PUT /api/v1/users/addresses/:addressId
exports.updateAddress = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    const address = user.addresses.id(req.params.addressId);
    
    if (!address) {
        throw new ApiError(404, 'Address not found');
    }
    
    Object.assign(address, req.body);
    await user.save();
    
    new ApiResponse(200, { addresses: user.addresses }, 'Address updated successfully').send(res);
});

// @desc    Delete address
// @route   DELETE /api/v1/users/addresses/:addressId
exports.deleteAddress = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    const address = user.addresses.id(req.params.addressId);
    
    if (!address) {
        throw new ApiError(404, 'Address not found');
    }
    
    address.deleteOne();
    await user.save();
    
    new ApiResponse(200, { addresses: user.addresses }, 'Address deleted successfully').send(res);
});

// @desc    Set default address
// @route   PATCH /api/v1/users/addresses/:addressId/default
exports.setDefaultAddress = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    
    user.addresses.forEach(addr => addr.isDefault = false);
    
    const address = user.addresses.id(req.params.addressId);
    if (!address) {
        throw new ApiError(404, 'Address not found');
    }
    address.isDefault = true;
    
    await user.save();
    
    new ApiResponse(200, { addresses: user.addresses }, 'Default address updated').send(res);
});

// @desc    Get all addresses
// @route   GET /api/v1/users/addresses
exports.getAddresses = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    
    new ApiResponse(200, { addresses: user.addresses }, 'Addresses fetched').send(res);
});

// @desc    Update notification preferences
// @route   PUT /api/v1/users/notification-preferences
exports.updateNotificationPreferences = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    
    user.notificationPreferences = {
        ...user.notificationPreferences,
        ...req.body
    };
    
    await user.save();
    
    new ApiResponse(200, { 
        notificationPreferences: user.notificationPreferences 
    }, 'Preferences updated').send(res);
});

// @desc    Get user wallet
// @route   GET /api/v1/users/wallet
exports.getWallet = asyncHandler(async (req, res) => {
    const Wallet = require('../models/Wallet');
    let wallet = await Wallet.findOne({ user: req.user._id });
    
    if (!wallet) {
        wallet = await Wallet.create({ user: req.user._id });
    }
    
    new ApiResponse(200, { wallet }, 'Wallet fetched').send(res);
});

// @desc    Get notifications
// @route   GET /api/v1/users/notifications
exports.getNotifications = asyncHandler(async (req, res) => {
    const Notification = require('../models/Notification');
    const { page = 1, limit = 20 } = req.query;
    
    const notifications = await Notification.find({ recipient: req.user._id })
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));
    
    const unreadCount = await Notification.countDocuments({
        recipient: req.user._id,
        isRead: false
    });
    
    new ApiResponse(200, {
        notifications,
        unreadCount,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit)
        }
    }, 'Notifications fetched').send(res);
});

// @desc    Mark notification as read
// @route   PATCH /api/v1/users/notifications/:id/read
exports.markNotificationRead = asyncHandler(async (req, res) => {
    const Notification = require('../models/Notification');
    
    const notification = await Notification.findOneAndUpdate(
        { _id: req.params.id, recipient: req.user._id },
        { isRead: true, readAt: new Date() },
        { new: true }
    );
    
    if (!notification) {
        throw new ApiError(404, 'Notification not found');
    }
    
    new ApiResponse(200, { notification }, 'Marked as read').send(res);
});

// @desc    Mark all notifications as read
// @route   PATCH /api/v1/users/notifications/read-all
exports.markAllNotificationsRead = asyncHandler(async (req, res) => {
    const Notification = require('../models/Notification');
    
    await Notification.updateMany(
        { recipient: req.user._id, isRead: false },
        { isRead: true, readAt: new Date() }
    );
    
    new ApiResponse(200, null, 'All notifications marked as read').send(res);
});