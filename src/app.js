const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const errorHandler = require('./middleware/errorHandler');
const ApiError = require('./utils/ApiError');

require('dotenv').config({ override: true });

// Import Routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const providerRoutes = require('./routes/providerRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const adminRoutes = require('./routes/adminRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const paymentController = require('./controllers/paymentController');
const chatRoutes = require('./routes/chatRoutes');
const locationRoutes = require('./routes/locationRoutes');

const app = express();
app.set('trust proxy', 1);

// Helper function to get local network IPs dynamically
const getLocalNetworkIPs = () => {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    const ips = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                ips.push(`http://${net.address}:5173`);
                ips.push(`http://${net.address}:5174`);
                ips.push(`http://${net.address}:5175`);
                ips.push(`http://${net.address}:5500`);
            }
        }
    }
    return ips;
};

// Updated CORS configuration - allow all network devices
const allowedOrigins = [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'https://ghar-seva-client.vercel.app',
    process.env.FRONTEND_URL,
    ...getLocalNetworkIPs(),
    /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:\d{4}$/,
    /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{4}$/,
    /^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}:\d{4}$/,
].filter(Boolean);

console.log('✅ CORS Allowed Origins:', allowedOrigins.filter(o => typeof o === 'string').length + ' patterns');

// Security Middleware - CORS with dynamic origin
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        let isAllowed = false;
        for (const allowed of allowedOrigins) {
            if (allowed instanceof RegExp) {
                if (allowed.test(origin)) { isAllowed = true; break; }
            } else if (allowed === origin) { isAllowed = true; break; }
        }
        if (process.env.NODE_ENV === 'development') {
            if (!isAllowed) console.log(`⚠️ CORS: Allowing development origin: ${origin}`);
            return callback(null, true);
        }
        if (isAllowed) callback(null, true);
        else {
            console.warn(`❌ CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With', 'Accept'],
    exposedHeaders: ['Set-Cookie'],
    optionsSuccessStatus: 200
}));

// Rate Limiting
const isDevelopment = process.env.NODE_ENV === 'development';
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: isDevelopment ? 1000 : 100,
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);

// Webhook before JSON parser
app.post('/api/v1/payments/webhook', express.raw({ type: 'application/json' }), paymentController.webhook);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

// Health check
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'Ghar Seva API is running',
        timestamp: new Date().toISOString(),
        razorpayConfigured: !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET,
        corsAllowed: true
    });
});

// Debug route (dev only)
if (process.env.NODE_ENV === 'development') {
    app.get('/api/v1/debug/env', (req, res) => {
        res.json({
            razorpay_key_exists: !!process.env.RAZORPAY_KEY_ID,
            razorpay_secret_exists: !!process.env.RAZORPAY_KEY_SECRET,
            node_env: process.env.NODE_ENV,
            client_ip: req.ip,
            client_origin: req.headers.origin
        });
    });
}

// Mount Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/providers', providerRoutes);
app.use('/api/v1/services', serviceRoutes);
app.use('/api/v1/bookings', bookingRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/location', locationRoutes);

// 404 Handler
app.use((req, res, next) => {
    next(new ApiError(404, `Can't find ${req.originalUrl} on this server!`));
});

// Error Handler
app.use(errorHandler);

module.exports = app;