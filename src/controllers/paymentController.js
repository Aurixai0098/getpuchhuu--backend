// controllers/paymentController.js
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const Wallet = require('../models/Wallet');
const Settings = require('../models/Settings');
const ServiceProvider = require('../models/ServiceProvider');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

// Helper function to round to 2 decimal places
const roundTo2 = (num) => Math.round(num * 100) / 100;

// Initialize Razorpay only if keys are present
let razorpay = null;
try {
    console.log('🔧 Checking Razorpay configuration...');
    console.log('RAZORPAY_KEY_ID exists?', !!process.env.RAZORPAY_KEY_ID);
    console.log('RAZORPAY_KEY_SECRET exists?', !!process.env.RAZORPAY_KEY_SECRET);
    
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
        const Razorpay = require('razorpay');
        razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID.trim(),
            key_secret: process.env.RAZORPAY_KEY_SECRET.trim()
        });
        console.log('✅ Razorpay initialized successfully');
    } else {
        console.warn('⚠️ Razorpay keys missing. Payment features will be disabled.');
    }
} catch (err) {
    console.error('❌ Failed to initialize Razorpay:', err.message);
}

const getCommission = async () => {
    const setting = await Settings.findOne({ key: 'commission' });
    return setting ? setting.value : 20;
};

// @desc    Create payment order for a booking
// @route   POST /api/v1/payments/create-order
exports.createOrder = asyncHandler(async (req, res) => {
    if (!razorpay) {
        throw new ApiError(503, 'Payment service is not configured. Please contact support.');
    }
    
    const { bookingId } = req.body;
    if (!bookingId) throw new ApiError(400, 'Booking ID is required');
    
    const booking = await Booking.findById(bookingId);
    if (!booking) throw new ApiError(404, 'Booking not found');
    if (booking.payment.status === 'paid') throw new ApiError(400, 'Payment already completed');
    
    const roundedTotal = roundTo2(booking.pricing.total);
    const amount = Math.round(roundedTotal * 100); // paise
    
    const options = {
        amount,
        currency: 'INR',
        receipt: `rcpt_${booking.bookingId}`,
        notes: {
            bookingId: booking._id.toString(),
            customerId: req.user._id.toString(),
            providerId: booking.provider.toString()
        }
    };
    
    try {
        const order = await razorpay.orders.create(options);
        
        await Payment.create({
            booking: booking._id,
            customer: req.user._id,
            provider: booking.provider,  // This is ServiceProvider._id
            amount: roundedTotal,
            razorpayOrderId: order.id,
            receipt: order.receipt,
            commission: { percentage: 0, amount: 0, providerEarning: 0 }
        });
        
        new ApiResponse(200, {
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            bookingId: booking._id
        }, 'Order created').send(res);
    } catch (razorpayError) {
        console.error('❌ Razorpay order creation failed:', razorpayError);
        throw new ApiError(500, 'Failed to create payment order: ' + razorpayError.message);
    }
});

// @desc    Verify payment + credit provider wallet after commission
// @route   POST /api/v1/payments/verify
exports.verifyPayment = asyncHandler(async (req, res) => {
    if (!razorpay) {
        throw new ApiError(503, 'Payment service is not configured.');
    }
    
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        throw new ApiError(400, 'Missing payment verification parameters');
    }
    
    const crypto = require('crypto');
    const sign = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSign = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET.trim())
        .update(sign.toString())
        .digest('hex');
    
    if (expectedSign !== razorpay_signature) {
        throw new ApiError(400, 'Invalid payment signature');
    }
    
    const payment = await Payment.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        {
            razorpayPaymentId: razorpay_payment_id,
            razorpaySignature: razorpay_signature,
            status: 'paid',
            method: 'online'
        },
        { new: true }
    );
    if (!payment) throw new ApiError(404, 'Payment record not found');
    
    // Get commission percentage
    const commissionPercentage = await getCommission();
    const totalAmount = payment.amount;
    
    const commissionAmount = roundTo2((totalAmount * commissionPercentage) / 100);
    const providerEarning = roundTo2(totalAmount - commissionAmount);
    
    payment.commission = {
        percentage: commissionPercentage,
        amount: commissionAmount,
        providerEarning: providerEarning
    };
    await payment.save();
    
    // Update booking payment status
    const booking = await Booking.findByIdAndUpdate(
        payment.booking,
        {
            'payment.status': 'paid',
            'payment.transactionId': razorpay_payment_id,
            'payment.paidAt': new Date(),
            'payment.paidAmount': totalAmount
        },
        { new: true }
    );
    
    // ✅ FIX: payment.provider stores ServiceProvider._id, need to get actual User._id
    const serviceProvider = await ServiceProvider.findById(payment.provider);
    if (!serviceProvider) {
        console.error('❌ ServiceProvider not found for id:', payment.provider);
        throw new ApiError(404, 'Provider not found');
    }
    const providerUserId = serviceProvider.user; // This is the actual User._id
    
    // Credit provider wallet using the correct user ID
    let wallet = await Wallet.findOne({ user: providerUserId });
    if (!wallet) {
        wallet = await Wallet.create({ user: providerUserId });
    }
    
    wallet.balance = roundTo2(wallet.balance + providerEarning);
    wallet.totalEarnings = roundTo2(wallet.totalEarnings + providerEarning);
    wallet.transactions.push({
        type: 'credit',
        amount: providerEarning,
        description: `Earning from booking ${booking.bookingId} (${commissionPercentage}% commission deducted)`,
        balance: wallet.balance,
        status: 'completed'
    });
    await wallet.save();
    
    console.log('✅ Payment verified and wallet credited:', {
        bookingId: booking.bookingId,
        totalAmount,
        commissionPercentage: `${commissionPercentage}%`,
        commissionAmount,
        providerEarning,
        providerUserId: providerUserId.toString(),
        walletBalance: wallet.balance
    });
    
    new ApiResponse(200, { payment, wallet, booking }, 'Payment verified & wallet credited').send(res);
});

// @desc    Payment webhook
// @route   POST /api/v1/payments/webhook
exports.webhook = asyncHandler(async (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
        console.warn('⚠️ RAZORPAY_WEBHOOK_SECRET not set, skipping signature verification');
        return res.status(200).json({ status: 'ok' });
    }
    
    const crypto = require('crypto');
    const shasum = crypto.createHmac('sha256', secret);
    shasum.update(JSON.stringify(req.body));
    const digest = shasum.digest('hex');
    
    if (digest !== req.headers['x-razorpay-signature']) {
        console.warn('❌ Invalid webhook signature');
        return res.status(400).json({ status: 'invalid signature' });
    }
    
    const event = req.body.event;
    if (event === 'payment.captured') {
        const paymentData = req.body.payload.payment.entity;
        await Payment.findOneAndUpdate(
            { razorpayOrderId: paymentData.order_id },
            {
                razorpayPaymentId: paymentData.id,
                status: 'paid'
            }
        );
        console.log(`✅ Webhook: Payment ${paymentData.id} captured`);
    }
    res.status(200).json({ status: 'ok' });
});

// @desc    Get payment history
// @route   GET /api/v1/payments/history
exports.getPaymentHistory = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const query = {};
    if (req.user.role === 'customer') {
        query.customer = req.user._id;
    } else if (req.user.role === 'provider') {
        const provider = await ServiceProvider.findOne({ user: req.user._id });
        if (provider) query.provider = provider._id;
    }
    const payments = await Payment.find(query)
        .populate('booking', 'bookingId scheduledDate')
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));
    const total = await Payment.countDocuments(query);
    new ApiResponse(200, {
        payments,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        }
    }, 'Payment history fetched').send(res);
});

// @desc    Withdraw from wallet (deprecated)
// @route   POST /api/v1/payments/withdraw
exports.withdrawFromWallet = asyncHandler(async (req, res) => {
    throw new ApiError(400, 'Use withdrawal request flow instead');
}); 