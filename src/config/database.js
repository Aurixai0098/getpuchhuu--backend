
const mongoose = require('mongoose');

const connectDB = async () => {
    console.log("Mongo URI present:", !!process.env.MONGODB_URI);

    const uri = process.env.MONGODB_URI;

    if (!uri) {
        throw new Error('MONGODB_URI is not configured');
    }

    try {
        console.log(
            "Mongo URI host:",
            uri ? new URL(uri).hostname : "MONGODB_URI NOT SET"
        );
    } catch {
        console.log("Mongo URI host: INVALID URI");
    }

    // Safe diagnostic checks — password print nahi hoga
    console.log("URI scheme:", uri?.split("://")[0]);
    console.log(
        "URI has expected host:",
        uri?.includes("@cluster0.3fwndbn.mongodb.net/")
    );
    console.log(
        "URI contains suspicious hostname:",
        uri?.includes("7240605631AURIX")
    );

    try {
        const conn = await mongoose.connect(
            uri,
            {
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
            }
        );

        mongoose.connection.on('connected', () => {
            console.log('📦 Mongoose connected to DB');
        });

        mongoose.connection.on('error', (err) => {
            console.error('❌ Mongoose connection error:', err.message);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('⚠️ Mongoose disconnected');
        });

        console.log(`📦 MongoDB Connected: ${conn.connection.host}`);

        return conn;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        throw error;
    }
};

module.exports = connectDB;
