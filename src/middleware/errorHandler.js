const ApiError = require('../utils/ApiError');

const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;
    if (err.name === 'MulterError') {
    console.error('MULTER ERROR DETAILS:', {
        code: err.code,
        field: err.field,
        path: req.originalUrl,
        method: req.method
    });
}

    // Log error
    console.error('Error:', {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
    });

    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
        const message = `Resource not found with id of ${err.value}`;
        error = new ApiError(404, message);
    }

    // Mongoose duplicate key
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        const message = `Duplicate field value: ${field}. Please use another value.`;
        error = new ApiError(400, message);
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const message = Object.values(err.errors).map(val => val.message);
        error = new ApiError(400, message);
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        error = new ApiError(401, 'Invalid token');
    }

    if (err.name === 'TokenExpiredError') {
        error = new ApiError(401, 'Token expired');
    }

    res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Internal Server Error',
        errors: error.errors || undefined,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
};

module.exports = errorHandler;