// middleware/updateProviderActivity.js
const ServiceProvider = require('../models/ServiceProvider');

const updateProviderActivity = async (req, res, next) => {
    // Only update for provider role users
    if (req.user && req.user.role === 'provider') {
        try {
            await ServiceProvider.findOneAndUpdate(
                { user: req.user._id },
                { lastActive: new Date() }
            );
        } catch (err) {
            console.error('Failed to update provider activity:', err);
        }
    }
    next();
};

module.exports = updateProviderActivity;