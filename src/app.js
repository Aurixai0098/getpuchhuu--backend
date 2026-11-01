// src/app.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const errorHandler = require('./middleware/errorHandler');
const ApiError = require('./utils/ApiError');


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
const cartRoutes = require('./routes/cartRoutes'); // ✅ ADDED

const app = express();
app.set('trust proxy', 1);

// ---- Security headers (helmet pehle require ho raha tha par use nahi hota tha) ----
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// ---- Gzip (npm i compression). Install na ho to bina compression chalega ----
try {
    // eslint-disable-next-line global-require
    app.use(require('compression')());
} catch (e) {
    console.warn('compression not installed (npm i compression) - responses uncompressed');
}

const allowedOrigins = [
    'https://www.puchhuu.com',
    'https://puchhuu.com',
    'https://getpuchhuu.vercel.app',
    'https://ghar-seva-client.vercel.app',
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:5174', 
    'http://localhost:5175',
    'http://localhost:3000',
    /^https:\/\/ghar-seva-client-.*\.vercel\.app$/,
    /^https:\/\/getpuchhuu(?:-[a-z0-9-]+)?\.vercel\.app$/,
].filter(Boolean);

app.use(cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        let isAllowed = false;
        for (const allowed of allowedOrigins) {
            if (allowed instanceof RegExp) {
                if (allowed.test(origin)) {
                    isAllowed = true;
                    break;
                }
            } else if (allowed === origin) {
                isAllowed = true;
                break;
            }
        }
        if (process.env.NODE_ENV === 'development') return callback(null, true);
        if (isAllowed) callback(null, true);
        else callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Set-Cookie'],
    optionsSuccessStatus: 200
}));

const isDevelopment = process.env.NODE_ENV === 'development';
const tooMany = (message) => (req, res) =>
    res.status(429).json({ success: false, message });

// Sab API par general limit (JSON response, taaki frontend .json() na toote)
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: isDevelopment ? 1000 : 200,
    standardHeaders: true,
    legacyHeaders: false,
    handler: tooMany('Too many requests from this IP, please try again later.')
});
app.use('/api', limiter);

// Login / register / password / OTP par sakht limit (brute-force rokne ke liye)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isDevelopment ? 1000 : 20,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: tooMany('Too many attempts. Please try again after 15 minutes.')
});
['login', 'register', 'forgot-password', 'reset-password', 'google', 'send-otp', 'verify-otp']
    .forEach((route) => app.use(`/api/v1/auth/${route}`, authLimiter));

app.post('/api/v1/payments/webhook', express.raw({ type: 'application/json' }), paymentController.webhook);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ---- NoSQL injection roke: { "email": { "$gt": "" } } jaisi keys hata do ----
const stripMongoOperators = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
        if (key.startsWith('$')) delete obj[key];
        else stripMongoOperators(obj[key]);
    }
};
app.use((req, res, next) => {
    stripMongoOperators(req.body);
    stripMongoOperators(req.params);
    stripMongoOperators(req.query);
    next();
});

// ---- Public services/categories GET: browser 1 min cache (repeat visits fast) ----
app.use('/api/v1/services', (req, res, next) => {
    if (req.method === 'GET') res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    next();
});

if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
    // Config / environment ki jaankari bahar nahi dikhani
    res.status(200).json({
        status: 'success',
        message: 'API is running',
        timestamp: new Date().toISOString()
    });
});

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
app.use('/api/v1/cart', cartRoutes); // ✅ ADDED

app.use((req, res, next) => {
    next(new ApiError(404, `Can't find ${req.originalUrl} on this server!`));
});

app.use(errorHandler);

module.exports = app;