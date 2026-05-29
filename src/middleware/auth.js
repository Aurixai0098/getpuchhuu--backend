const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

exports.protect = asyncHandler(async (req, res, next) => {
    let token;

    // Check for token in cookies first
    if (req.cookies.accessToken) {
        token = req.cookies.accessToken;
    }
    // Then check Authorization header
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        throw new ApiError(401, 'You are not logged in. Please log in to access this resource.');
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Check if user still exists
        const user = await User.findById(decoded.id).select('-password');
        if (!user) {
            throw new ApiError(401, 'The user belonging to this token no longer exists.');
        }

        // Check if user is active
        if (user.status !== 'active') {
            throw new ApiError(401, 'Your account has been deactivated. Please contact support.');
        }

        // Grant access
        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            throw new ApiError(401, 'Invalid token. Please log in again.');
        }
        if (error.name === 'TokenExpiredError') {
            throw new ApiError(401, 'Your token has expired. Please log in again.');
        }
        throw error;
    }
});

exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            throw new ApiError(403, 'You do not have permission to perform this action');
        }
        next();
    };
};

exports.refreshToken = asyncHandler(async (req, res, next) => {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
        throw new ApiError(401, 'No refresh token provided');
    }

    try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            throw new ApiError(401, 'Invalid refresh token');
        }

        // Generate new tokens
        const { generateTokens } = require('../utils/generateToken');
        const tokens = generateTokens(user._id);

        // Set new cookies
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        };

        res.cookie('accessToken', tokens.accessToken, {
            ...cookieOptions,
            maxAge: 15 * 60 * 1000 // 15 minutes
        });
        res.cookie('refreshToken', tokens.refreshToken, cookieOptions);

        req.user = user;
        next();
    } catch (error) {
        throw new ApiError(401, 'Invalid refresh token');
    }
});