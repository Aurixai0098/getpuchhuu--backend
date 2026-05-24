const mongoose = require('mongoose');

const serviceProviderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    businessName: { type: String, required: true },
    bio: String,
    experience: {
        years: { type: Number, default: 0 },
        description: String
    },
    services: [{
        category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
        subServices: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SubService' }],
        customPricing: { type: Number },
        isActive: { type: Boolean, default: true }
    }],
    workingHours: [{
        day: { type: String, enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] },
        isWorking: { type: Boolean, default: true },
        slots: [{ startTime: String, endTime: String }]
    }],
    serviceArea: {
        cities: [String],
        pincodes: [String],
        radius: { type: Number, default: 10 }, // km
        coordinates: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], default: [0, 0] }  // ✅ default valid point
        }
    },
    currentLocation: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number] , default: [0, 0]}, // ✅ optional – not created initially
        updatedAt: { type: Date, default: null }
    },
    documents: [{
        type: { type: String, enum: ['aadhar', 'pan', 'driving_license', 'certificate', 'other'] },
        documentNumber: String,
        frontImage: { url: String, publicId: String },
        backImage: { url: String, publicId: String },
        isVerified: { type: Boolean, default: false },
        verifiedAt: Date,
        verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],
    bankDetails: {
        accountHolderName: String,
        accountNumber: String,
        ifscCode: String,
        bankName: String,
        upiId: String,
        isVerified: { type: Boolean, default: false }
    },
    verificationStatus: {
        type: String,
        enum: ['pending', 'under_review', 'verified', 'rejected'],
        default: 'pending'
    },
    verificationNote: String,
    verifiedAt: Date,
    isAvailable: { type: Boolean, default: false },
    lastActive: { type: Date, default: Date.now },
    rating: {
        average: { type: Number, default: 0 },
        count: { type: Number, default: 0 },
        breakdown: {
            five: { type: Number, default: 0 },
            four: { type: Number, default: 0 },
            three: { type: Number, default: 0 },
            two: { type: Number, default: 0 },
            one: { type: Number, default: 0 }
        }
    },
    stats: {
        totalBookings: { type: Number, default: 0 },
        completedBookings: { type: Number, default: 0 },
        cancelledBookings: { type: Number, default: 0 },
        totalEarnings: { type: Number, default: 0 }
    }
}, { timestamps: true });

// Geospatial indexes
serviceProviderSchema.index({ 'serviceArea.coordinates': '2dsphere' });
serviceProviderSchema.index({ currentLocation: '2dsphere' });
serviceProviderSchema.index({ lastActive: -1 });
serviceProviderSchema.index({ verificationStatus: 1, isAvailable: 1 });
serviceProviderSchema.index({ 'services.category': 1 });

const ServiceProvider = mongoose.model('ServiceProvider', serviceProviderSchema);
module.exports = ServiceProvider;