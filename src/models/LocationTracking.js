// src/models/LocationTracking.js
const mongoose = require('mongoose');

const locationTrackingSchema = new mongoose.Schema({
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
  },
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ServiceProvider',
    required: true,
  },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

locationTrackingSchema.index({ booking: 1, timestamp: -1 });
locationTrackingSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('LocationTracking', locationTrackingSchema);