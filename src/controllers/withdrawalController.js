// controllers/withdrawalController.js
const WithdrawalRequest = require('../models/WithdrawalRequest');
const Wallet = require('../models/Wallet');
const Notification = require('../models/Notification');
const ServiceProvider = require('../models/ServiceProvider');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { sendEmail } = require('../utils/sendEmail');

// Provider requests withdrawal
exports.requestWithdrawal = asyncHandler(async (req, res) => {
    const { amount, accountDetails } = req.body;
    if (amount < 100) throw new ApiError(400, 'Minimum withdrawal amount is ₹100');
    
    const providerProfile = await ServiceProvider.findOne({ user: req.user._id });
    if (!providerProfile) throw new ApiError(404, 'Provider profile not found');

    const wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet || wallet.balance < amount) throw new ApiError(400, 'Insufficient wallet balance');
    
    const request = await WithdrawalRequest.create({
        provider: req.user._id,
        amount,
        accountDetails,
        status: 'pending'
    });
    
    // Notify all admins
    const User = require('../models/User');
    const admins = await User.find({ role: 'admin' });
    for (const admin of admins) {
        await Notification.create({
            recipient: admin._id,
            type: 'system',
            title: '💰 New Withdrawal Request',
            message: `${req.user.fullName || req.user.firstName} requested ₹${amount} withdrawal`,
            data: { withdrawalId: request._id },
            channels: { inApp: true, email: true }
        });
    }
    
    new ApiResponse(201, { request }, 'Withdrawal request submitted').send(res);
});

// Admin updates withdrawal status (processing, completed, rejected)
exports.updateWithdrawalStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, reason, transactionId } = req.body;
    
    if (!['pending', 'processing', 'completed', 'rejected'].includes(status)) {
        throw new ApiError(400, 'Invalid status');
    }
    
    const request = await WithdrawalRequest.findById(id).populate('provider', 'email firstName lastName');
    if (!request) throw new ApiError(404, 'Request not found');
    if (request.status !== 'pending' && status !== 'completed' && status !== 'rejected') {
        // Allow moving from processing to completed only
        if (!(request.status === 'processing' && status === 'completed')) {
            throw new ApiError(400, `Cannot change from ${request.status} to ${status}`);
        }
    }
    
    const oldStatus = request.status;
    request.status = status;
    if (reason) request.adminNote = reason;
    if (transactionId) request.transactionId = transactionId;
    if (status === 'processing' || status === 'completed' || status === 'rejected') {
        request.processedAt = new Date();
    }
    await request.save();
    
    // If status changes to completed, deduct from wallet (already deducted? Actually pending request doesn't deduct yet)
    if (status === 'completed' && oldStatus !== 'completed') {
        const wallet = await Wallet.findOne({ user: request.provider._id });
        if (wallet && wallet.balance >= request.amount) {
            wallet.balance -= request.amount;
            wallet.totalWithdrawals += request.amount;
            wallet.transactions.push({
                type: 'debit',
                amount: request.amount,
                description: `Withdrawal completed - ${request.transactionId || 'Manual settlement'}`,
                balance: wallet.balance,
                status: 'completed'
            });
            await wallet.save();
        }
    }
    
    // Send email & notification to provider
    const providerEmail = request.provider.email;
    const providerName = request.provider.firstName;
    let emailSubject = '', emailHtml = '', notifTitle = '', notifMessage = '';
    
    if (status === 'processing') {
        emailSubject = 'Withdrawal Request Under Processing';
        emailHtml = `<h2>Hello ${providerName},</h2><p>Your withdrawal request of ₹${request.amount} is now <strong>being processed</strong>.</p><p>Reason: ${reason || 'Admin is reviewing your request'}</p><p>You will receive an update once the transfer is completed.</p>`;
        notifTitle = 'Withdrawal Being Processed';
        notifMessage = `Your ₹${request.amount} withdrawal is under review. ${reason ? 'Reason: ' + reason : ''}`;
    } else if (status === 'completed') {
        emailSubject = 'Withdrawal Request Completed';
        emailHtml = `<h2>Hello ${providerName},</h2><p>Your withdrawal request of ₹${request.amount} has been <strong>successfully processed</strong>.</p><p>Transaction ID: ${request.transactionId || 'N/A'}</p><p>Amount has been sent to your ${request.accountDetails?.upiId ? 'UPI ID' : 'bank account'}.</p>`;
        notifTitle = 'Withdrawal Completed';
        notifMessage = `₹${request.amount} has been transferred to your account.`;
    } else if (status === 'rejected') {
        emailSubject = 'Withdrawal Request Rejected';
        emailHtml = `<h2>Hello ${providerName},</h2><p>Your withdrawal request of ₹${request.amount} has been <strong>rejected</strong>.</p><p>Reason: ${reason || 'Please contact support.'}</p>`;
        notifTitle = 'Withdrawal Rejected';
        notifMessage = `Your ₹${request.amount} withdrawal was rejected. Reason: ${reason || 'Contact support'}`;
    }
    
    if (emailSubject) {
        try {
            await sendEmail({ email: providerEmail, subject: emailSubject, html: emailHtml });
        } catch (err) { console.error('Email error:', err); }
    }
    
    await Notification.create({
        recipient: request.provider._id,
        type: 'system',
        title: notifTitle,
        message: notifMessage,
        data: { withdrawalId: request._id, status },
        channels: { inApp: true, email: true }
    });
    
    new ApiResponse(200, { request }, `Withdrawal ${status}`).send(res);
});

// Admin gets all withdrawal requests with filters
exports.getAllWithdrawalRequests = asyncHandler(async (req, res) => {
    const { status, providerId, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (providerId) query.provider = providerId;
    
    const requests = await WithdrawalRequest.find(query)
        .populate('provider', 'firstName lastName email phone')
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));
    
    const total = await WithdrawalRequest.countDocuments(query);
    new ApiResponse(200, {
        requests,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    }, 'Requests fetched').send(res);
});

// Get all providers with wallet balance for admin dashboard
exports.getAllProviderWallets = asyncHandler(async (req, res) => {
    const providers = await ServiceProvider.find()
        .populate('user', 'firstName lastName email avatar')
        .select('businessName user');
    
    const walletData = await Promise.all(providers.map(async (provider) => {
        const wallet = await Wallet.findOne({ user: provider.user._id });
        return {
            providerId: provider._id,
            businessName: provider.businessName,
            ownerName: `${provider.user.firstName} ${provider.user.lastName}`,
            email: provider.user.email,
            avatar: provider.user.avatar?.url,
            balance: wallet ? wallet.balance : 0,
            totalEarnings: wallet ? wallet.totalEarnings : 0,
            totalWithdrawn: wallet ? wallet.totalWithdrawals : 0
        };
    }));
    
    new ApiResponse(200, { providers: walletData }, 'Provider wallets fetched').send(res);
});

// Get withdrawal history for a specific provider
exports.getProviderWithdrawals = asyncHandler(async (req, res) => {
    const { providerId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    const providerUser = await ServiceProvider.findById(providerId).select('user');
    if (!providerUser) throw new ApiError(404, 'Provider not found');
    
    const requests = await WithdrawalRequest.find({ provider: providerUser.user })
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));
    
    const total = await WithdrawalRequest.countDocuments({ provider: providerUser.user });
    new ApiResponse(200, {
        withdrawals: requests,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    }, 'Provider withdrawal history').send(res);
});

// Provider gets their withdrawal history (already exists, but enhance)
exports.getMyWithdrawals = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, status } = req.query;
    const query = { provider: req.user._id };
    if (status) query.status = status;
    
    const requests = await WithdrawalRequest.find(query)
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));
    const total = await WithdrawalRequest.countDocuments(query);
    new ApiResponse(200, {
        requests,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    }, 'Withdrawal history fetched').send(res);
});