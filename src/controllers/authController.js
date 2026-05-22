// controllers/authController.js

const User = require('../models/User');
const generateTokens = require('../utils/generateToken');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

// ✅ Cookie options for cross-domain (Render backend + Vercel frontend + iOS)
const getCookieOptions = (isProduction = true) => {
    return {
        httpOnly: true,
        secure: true,           // ✅ HTTPS ke liye zaroori (Render aur Vercel dono HTTPS use karte hain)
        sameSite: 'none',       // ✅ Cross-domain cookies ke liye (different domains)
        path: '/',
        domain: undefined       // Don't set domain for cross-site
    };
};

// @desc    Register user directly
// @route   POST /api/v1/auth/register
exports.register = asyncHandler(async (req, res) => {
    const { firstName, lastName, email, phone, password, avatarUrl } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
        throw new ApiError(400, 'User already exists with this email or phone');
    }

    // Create user data with optional avatar
    const userData = {
        firstName,
        lastName,
        email,
        phone,
        password,
        isEmailVerified: true,
        status: 'active'
    };
    
    if (avatarUrl) {
        userData.avatar = { url: avatarUrl, publicId: null };
    }
    
    const user = await User.create(userData);

    // Generate tokens
    const tokens = generateTokens(user._id);
    const cookieOptions = getCookieOptions(process.env.NODE_ENV === 'production');

    // Set cookies
    res.cookie('accessToken', tokens.accessToken, {
        ...cookieOptions,
        maxAge: 15 * 60 * 1000 // 15 minutes
    });
    res.cookie('refreshToken', tokens.refreshToken, {
        ...cookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Update last login
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    new ApiResponse(201, {
        user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            role: user.role,
            avatar: user.avatar
        },
        accessToken: tokens.accessToken
    }, 'Registration successful').send(res);
});

// @desc    Login with email and password
// @route   POST /api/v1/auth/login
exports.login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Find user and include password field
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
        throw new ApiError(401, 'Invalid email or password');
    }

    if (user.status !== 'active') {
        throw new ApiError(401, 'Your account has been deactivated. Please contact support.');
    }

    // Check password
    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
        throw new ApiError(401, 'Invalid email or password');
    }

    // Generate tokens
    const tokens = generateTokens(user._id);
    const cookieOptions = getCookieOptions(process.env.NODE_ENV === 'production');

    // Set cookies
    res.cookie('accessToken', tokens.accessToken, {
        ...cookieOptions,
        maxAge: 15 * 60 * 1000
    });
    res.cookie('refreshToken', tokens.refreshToken, {
        ...cookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000
    });

    // Update last login
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    new ApiResponse(200, {
        user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            role: user.role,
            avatar: user.avatar
        },
        accessToken: tokens.accessToken
    }, 'Login successful').send(res);
});

// @desc    Get current user profile
// @route   GET /api/v1/auth/me
exports.getMe = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    new ApiResponse(200, { user }, 'User profile fetched').send(res);
});

// @desc    Logout user / clear cookies
// @route   POST /api/v1/auth/logout
exports.logout = asyncHandler(async (req, res) => {
    const cookieOptions = getCookieOptions(process.env.NODE_ENV === 'production');
    res.cookie('accessToken', 'none', {
        ...cookieOptions,
        maxAge: 5 * 1000
    });
    res.cookie('refreshToken', 'none', {
        ...cookieOptions,
        maxAge: 5 * 1000
    });
    new ApiResponse(200, null, 'Logged out successfully').send(res);
});

// @desc    Refresh access token
// @route   POST /api/v1/auth/refresh-token
exports.refreshAccessToken = asyncHandler(async (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
        throw new ApiError(401, 'No refresh token provided');
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
        throw new ApiError(401, 'Invalid refresh token');
    }

    const tokens = generateTokens(user._id);
    const cookieOptions = getCookieOptions(process.env.NODE_ENV === 'production');
    res.cookie('accessToken', tokens.accessToken, {
        ...cookieOptions,
        maxAge: 15 * 60 * 1000
    });
    new ApiResponse(200, { 
        message: 'Token refreshed',
        user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            role: user.role,
            avatar: user.avatar
        }
    }, 'Token refreshed').send(res);
});

// @desc    Forgot password - send reset link
// @route   POST /api/v1/auth/forgot-password
exports.forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        throw new ApiError(400, 'Email is required');
    }
    
    const user = await User.findOne({ email });
    if (!user) {
        // For security, don't reveal that user doesn't exist
        return new ApiResponse(200, null, 'If your email is registered, you will receive a reset link').send(res);
    }
    
    // Generate reset token
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = Date.now() + 3600000; // 1 hour
    
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = resetExpires;
    await user.save({ validateBeforeSave: false });
    
    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL || 'https://ghar-seva-client.vercel.app'}/reset-password?token=${resetToken}`;
    
    // Send email
    const { sendEmail } = require('../utils/sendEmail');
    try {
        await sendEmail({
            email: user.email,
            subject: 'Password Reset Request',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #2563eb;">Reset Your Password</h2>
                    <p>Hello ${user.firstName},</p>
                    <p>You requested to reset your password. Click the button below to reset it:</p>
                    <a href="${resetUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">Reset Password</a>
                    <p>This link will expire in 1 hour.</p>
                    <p>If you didn't request this, please ignore this email.</p>
                    <hr style="margin: 20px 0; border-color: #e5e7eb;">
                    <p style="color: #6b7280; font-size: 12px;">GharSeva - Your trusted home service partner</p>
                </div>
            `
        });
    } catch (err) {
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save({ validateBeforeSave: false });
        throw new ApiError(500, 'Failed to send reset email. Please try again.');
    }
    
    new ApiResponse(200, null, 'Password reset link sent to your email').send(res);
});

// @desc    Reset password with token
// @route   POST /api/v1/auth/reset-password
exports.resetPassword = asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
        throw new ApiError(400, 'Token and new password are required');
    }
    
    if (newPassword.length < 8) {
        throw new ApiError(400, 'Password must be at least 8 characters');
    }
    
    const user = await User.findOne({
        passwordResetToken: token,
        passwordResetExpires: { $gt: Date.now() }
    });
    
    if (!user) {
        throw new ApiError(400, 'Invalid or expired reset token');
    }
    
    // Update password
    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    
    new ApiResponse(200, null, 'Password reset successfully. Please login with your new password.').send(res);
});

// @desc    Change password (when logged in)
// @route   POST /api/v1/auth/change-password
exports.changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
        throw new ApiError(400, 'Current password and new password are required');
    }
    
    if (newPassword.length < 8) {
        throw new ApiError(400, 'New password must be at least 8 characters');
    }
    
    const user = await User.findById(req.user._id).select('+password');
    
    // Verify current password
    const isPasswordMatch = await user.comparePassword(currentPassword);
    if (!isPasswordMatch) {
        throw new ApiError(401, 'Current password is incorrect');
    }
    
    // Update password
    user.password = newPassword;
    await user.save();
    
    new ApiResponse(200, null, 'Password changed successfully').send(res);
});