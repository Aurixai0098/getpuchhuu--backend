// src/controllers/chatController.js
const Chat = require('../models/Chat');
const Booking = require('../models/Booking');
const ServiceProvider = require('../models/ServiceProvider');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { uploadToCloudinary } = require('../config/cloudinary');

// Chat history (existing)
exports.getChatHistory = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found');

  if (req.user.role === 'customer' && booking.customer.toString() !== req.user._id.toString()) {
    throw new ApiError(403, 'Not authorized');
  }
  if (req.user.role === 'provider') {
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    if (!provider || provider._id.toString() !== booking.provider.toString()) {
      throw new ApiError(403, 'Not authorized');
    }
  }

  const messages = await Chat.find({ booking: bookingId }).sort('createdAt');
  new ApiResponse(200, { messages }, 'Chat history fetched').send(res);
});

// Image upload (new)
exports.uploadChatImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'No image file provided');
  }

  if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new ApiError(500, 'Cloudinary is not configured. Please set environment variables.');
  }

  try {
    const result = await uploadToCloudinary(req.file.buffer, 'chat-images');
    const imageUrl = result.secure_url;
    new ApiResponse(200, { url: imageUrl }, 'Image uploaded successfully').send(res);
  } catch (cloudinaryErr) {
    console.error('Cloudinary upload error:', cloudinaryErr);
    throw new ApiError(500, 'Failed to upload image to Cloudinary');
  }
});