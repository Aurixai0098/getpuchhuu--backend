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
    console.log('📥 Received Google token:', token ? token.substring(0, 50) + '...' : 'No token');
    
    if (!token) throw new ApiError(400, 'Google token is required');

    try {
        let payload;

        // 1) Try to verify as ID token (the correct method)
        try {
            const ticket = await client.verifyIdToken({
                idToken: token,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            payload = ticket.getPayload();
            console.log('✅ ID token verified successfully');
        } catch (idTokenError) {
            console.error('❌ ID token verification failed:', idTokenError.message);
            
            // 2) Fallback: Try as access token (if using different flow)
            try {
                const tokenInfo = await client.getTokenInfo(token);
                payload = {
                    email: tokenInfo.email,
                    sub: tokenInfo.sub,
                    given_name: '',
                    family_name: '',
                    picture: ''
                };
                console.log('✅ Access token verified successfully (fallback)');
            } catch (accessTokenError) {
                console.error('❌ Access token verification also failed:', accessTokenError.message);
                throw new ApiError(401, 'Invalid Google token');
            }
        }

        const { email, given_name, family_name, picture, sub: googleId } = payload;

        if (!email) throw new ApiError(400, 'Email not provided by Google');

        console.log(`🔍 Google user: ${email}, googleId: ${googleId}`);

        // Find or create user
        let user = await User.findOne({ email });

        if (user) {
            // Existing user: link Google ID if not already linked
            if (!user.googleId) {
                user.googleId = googleId;
                await user.save();
                console.log(`✅ Linked Google ID to existing user ${email}`);
            }
        } else {
            // New user: create account with Google data
            user = await User.create({
                firstName: given_name || '',
                lastName: family_name || '',
                email,
                phone: '', // empty – user can add later
                password: Math.random().toString(36).slice(-16),
                googleId,
                isEmailVerified: true,
                avatar: picture ? { url: picture, publicId: null } : undefined,
                status: 'active'
            });
            console.log(`✅ Created new user via Google: ${email}`);
        }

        // Generate your app's JWT tokens
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
        console.error('🔥 Google auth error details:', error);
        if (error instanceof ApiError) throw error;
        throw new ApiError(401, 'Invalid Google token');
    }
});