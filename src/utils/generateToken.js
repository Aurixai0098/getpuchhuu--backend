const jwt = require('jsonwebtoken');

const generateTokens = (userId) => {
    // Access Token (short-lived)
    const accessToken = jwt.sign(
        { id: userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '15m' }
    );

    // Refresh Token (long-lived)
    const refreshToken = jwt.sign(
        { id: userId },
        process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' }
    );

    return { accessToken, refreshToken };
};

module.exports = generateTokens;