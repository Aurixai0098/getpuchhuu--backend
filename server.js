// ✅ DOTENV MUST BE FIRST - Environment variables load karo
require('dotenv').config({ override: true });

// Debug - Check if keys are loaded
console.log('=== 🔧 ENVIRONMENT CHECK ===');
console.log('RAZORPAY_KEY_ID:', process.env.RAZORPAY_KEY_ID ? '✅ Loaded' : '❌ Missing');
console.log('RAZORPAY_KEY_SECRET:', process.env.RAZORPAY_KEY_SECRET ? '✅ Loaded' : '❌ Missing');
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('PORT:', process.env.PORT || 5000);
console.log('============================\n');

const app = require('./src/app');
const connectDB = require('./src/config/database');
const http = require('http');
const { Server } = require('socket.io');
const socketManager = require('./src/socket/socketManager');

// ✅ Helper function to get local IP address
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

// Handle Uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error(`UNCAUGHT EXCEPTION! 💥 Shutting down...`);
    console.error(err.name, err.message);
    process.exit(1);
});

// Connect to Database & Redis
const startServer = async () => {
    try {
        await connectDB();
        console.log('📦 MongoDB Connected Successfully');

        const PORT = process.env.PORT || 5000;
        const localIp = getLocalIp();
        
        // ✅ Bind to '0.0.0.0' to accept connections from any network device
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n🚀 Server running in ${process.env.NODE_ENV || 'development'} mode`);
            console.log(`📍 Local: http://localhost:${PORT}`);
            console.log(`📍 Network: http://${localIp}:${PORT}`);
            console.log(`📍 API URL: http://localhost:${PORT}/api/v1`);
            console.log(`💚 Health Check: http://localhost:${PORT}/api/health\n`);
            console.log(`📱 To connect from other devices, use: http://${localIp}:${PORT}`);
        });

        // Initialize Socket.IO
        const io = new Server(server, {
            cors: {
                origin: '*', // In production, restrict to your frontend URL
                credentials: true,
            },
        });
        app.set('io', io);
        socketManager(io);

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (err) => {
            console.error(`UNHANDLED REJECTION! 💥 Shutting down...`);
            console.error(err.name, err.message);
            server.close(() => {
                process.exit(1);
            });
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('👋 SIGTERM RECEIVED. Shutting down gracefully');
            server.close(() => {
                console.log('💥 Process terminated!');
            });
        });

    } catch (error) {
        console.error('Failed to start server:', error.message);
        process.exit(1);
    }
};

startServer();