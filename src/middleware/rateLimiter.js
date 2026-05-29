const rateLimit = require('express-rate-limit');

const isDevelopment = process.env.NODE_ENV === 'development';

const otpRateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: isDevelopment ? 1000 : 100,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: 'Too many OTP requests. Please wait a moment.'
        });
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isDevelopment ? 1000 : 100,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false }
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,  // 1 minute
    max: isDevelopment ? 1000 : 100,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false }
});

module.exports = { otpRateLimiter, authLimiter, apiLimiter };