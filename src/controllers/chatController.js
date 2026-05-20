const Chat = require('../models/Chat');
const Booking = require('../models/Booking');
const ServiceProvider = require('../models/ServiceProvider');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

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