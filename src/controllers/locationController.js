// src/controllers/locationController.js
const LocationTracking = require('../models/LocationTracking');
const Booking = require('../models/Booking');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

exports.getProviderLocations = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const locations = await LocationTracking.find({ booking: bookingId })
    .sort('timestamp')
    .select('location timestamp');
  new ApiResponse(200, { locations }, 'Location history fetched').send(res);
});