// controllers/googleAuthController.js
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const generateTokens = require('../utils/generateToken');

const getCookieOptions = (isProduction = true) => {
    return {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
        domain: undefined
    };
};

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.googleAuth = asyncHandler(async (req, res) => {
    const { token } = req.body;
    if (!token) throw new ApiError(400, 'Google token is required');

    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { email, given_name, family_name, picture, sub: googleId } = payload;

        if (!email) throw new ApiError(400, 'Email not provided by Google');

        let user = await User.findOne({ email });

        if (user) {
            // Link Google ID if not already linked
            if (!user.googleId) {
                user.googleId = googleId;
                await user.save();
            }
        } else {
            // Create new user with Google data
            user = await User.create({
                firstName: given_name || '',
                lastName: family_name || '',
                email,
                phone: '',
                password: Math.random().toString(36).slice(-16),
                googleId,
                isEmailVerified: true,
                avatar: picture ? { url: picture, publicId: null } : undefined,
                status: 'active'
            });
        }

        // Generate JWT tokens
        const tokens = generateTokens(user._id);
        const cookieOptions = getCookieOptions(process.env.NODE_ENV === 'production');

        res.cookie('accessToken', tokens.accessToken, {
            ...cookieOptions,
            maxAge: 15 * 60 * 1000
        });
        res.cookie('refreshToken', tokens.refreshToken, {
            ...cookieOptions,
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

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
        }, 'Google login successful').send(res);
    } catch (error) {
        console.error('Google auth error:', error);
        throw new ApiError(401, 'Invalid Google token');
    }
});