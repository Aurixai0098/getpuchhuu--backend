// server.js
require('dotenv').config({ override: true });

console.log('=== 🔧 ENVIRONMENT CHECK ===');
console.log('RAZORPAY_KEY_ID:', process.env.RAZORPAY_KEY_ID ? '✅ Loaded' : '❌ Missing');
console.log('RAZORPAY_KEY_SECRET:', process.env.RAZORPAY_KEY_SECRET ? '✅ Loaded' : '❌ Missing');
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('PORT:', process.env.PORT || 5000);
console.log('FRONTEND_URL:', process.env.FRONTEND_URL || 'https://ghar-seva-client.vercel.app');
console.log('============================\n');

const app = require('./src/app');
const connectDB = require('./src/config/database');
const http = require('http');
const { Server } = require('socket.io');
const socketManager = require('./src/socket/socketManager');

function getLocalIp() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

process.on('uncaughtException', (err) => {
    console.error(`UNCAUGHT EXCEPTION! 💥 Shutting down...`);
    console.error(err.name, err.message);
    process.exit(1);
});

const startServer = async () => {
    try {
        await connectDB();
        console.log('📦 MongoDB Connected Successfully');

        const PORT = process.env.PORT || 5000;
        const localIp = getLocalIp();
        
        const allowedOrigins = [
            'https://ghar-seva-client.vercel.app',
            process.env.FRONTEND_URL,
            'http://localhost:5173',
            'http://localhost:5174',
            'http://localhost:5175',
            'http://localhost:3000',
            /^https:\/\/ghar-seva-client-.*\.vercel\.app$/,
        ].filter(Boolean);

        const server = http.createServer(app);

        const io = new Server(server, {
            cors: {
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
                    if (process.env.NODE_ENV === 'development') {
                        return callback(null, true);
                    }
                    if (isAllowed) {
                        callback(null, true);
                    } else {
                        console.warn(`❌ CORS blocked origin: ${origin}`);
                        callback(new Error('Not allowed by CORS'));
                    }
                },
                credentials: true,
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
                allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With', 'Accept'],
                exposedHeaders: ['Set-Cookie']
            },
            transports: ['websocket', 'polling'],
            allowEIO3: true,
            pingTimeout: 60000,
            pingInterval: 25000,
            path: '/socket.io/'
        });

        app.set('io', io);
        socketManager(io);

        server.listen(PORT, '0.0.0.0', () => {
            console.log(`\n🚀 Server running in ${process.env.NODE_ENV || 'development'} mode`);
            console.log(`📍 Local: http://localhost:${PORT}`);
            console.log(`📍 Network: http://${localIp}:${PORT}`);
            console.log(`📍 Production URL: ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}`);
            console.log(`🔌 Socket.IO path: /socket.io/`);
            console.log(`✅ CORS allowed origins: ${allowedOrigins.filter(o => typeof o === 'string').join(', ')}`);
        });

        process.on('unhandledRejection', (err) => {
            console.error(`UNHANDLED REJECTION! 💥 Shutting down...`);
            console.error(err.name, err.message);
            server.close(() => process.exit(1));
        });

        process.on('SIGTERM', () => {
            console.log('👋 SIGTERM RECEIVED. Shutting down gracefully');
            server.close(() => console.log('💥 Process terminated!'));
        });

    } catch (error) {
        console.error('Failed to start server:', error.message);
        process.exit(1);
    }
};

startServer();