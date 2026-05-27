// controllers/bookingController.js
const Booking = require('../models/Booking');
const ServiceProvider = require('../models/ServiceProvider');
const SubService = require('../models/SubService');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { sendEmail, emailTemplates } = require('../utils/sendEmail');

const roundTo2 = (num) => Math.round(num * 100) / 100;

// @desc    Create new booking (with optional providerId)
// @route   POST /api/v1/bookings
exports.createBooking = asyncHandler(async (req, res) => {
  const { services, scheduledDate, scheduledTime, serviceAddress, payment, notes, category, providerId } = req.body;

  // Calculate pricing
  let subtotal = 0;
  const bookingItems = [];

  for (const item of services) {
    const service = await SubService.findById(item.service);
    if (!service) throw new ApiError(404, `Service ${item.service} not found`);
    const unitPrice = item.customPrice || service.basePrice;
    const totalPrice = unitPrice * (item.quantity || 1);
    bookingItems.push({
      service: service._id,
      serviceName: service.name,
      quantity: item.quantity || 1,
      unitPrice: roundTo2(unitPrice),
      totalPrice: roundTo2(totalPrice),
      notes: item.notes
    });
    subtotal += totalPrice;
  }

  subtotal = roundTo2(subtotal);
  const gst = roundTo2(subtotal * 0.09);
  const sgst = roundTo2(subtotal * 0.09);
  const convenienceFee = roundTo2(subtotal * 0.05);
  const total = roundTo2(subtotal + gst + sgst + convenienceFee);

  const finalBookingId = `BK-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  // If providerId is provided, assign directly
  let provider = null;
  if (providerId) {
    provider = await ServiceProvider.findById(providerId);
    if (!provider) throw new ApiError(404, 'Provider not found');
  }

  const booking = await Booking.create({
    bookingId: finalBookingId,
    customer: req.user._id,
    provider: provider ? provider._id : null,
    category,
    items: bookingItems,
    scheduledDate,
    scheduledTime,
    serviceAddress,
    pricing: { subtotal, taxes: { gst, sgst, cgst: 0 }, convenienceFee, total },
    payment: { method: payment.method, status: 'pending' },
    customerNotes: notes,
    status: provider ? 'pending' : 'searching'
  });

  booking.timeline.push({
    status: provider ? 'pending' : 'searching',
    note: provider ? 'Waiting for provider confirmation' : 'Searching for nearby providers',
    updatedBy: req.user._id
  });
  await booking.save();

  // Send confirmation email to customer
  try {
    await sendEmail({
      email: req.user.email,
      subject: `Booking Created - ${booking.bookingId}`,
      html: emailTemplates.bookingConfirmation(booking)
    });
  } catch (error) { console.error('Failed to send booking email:', error); }

  // Notify customer
  const Notification = require('../models/Notification');
  await Notification.create({
    recipient: req.user._id,
    type: 'booking_created',
    title: 'Booking Created',
    message: `Your booking ${booking.bookingId} has been created. ${provider ? 'Waiting for provider confirmation.' : 'Searching for a provider...'}`,
    reference: { model: 'Booking', id: booking._id },
    channels: { inApp: true, email: true }
  });

  const io = req.app.get('io');
  if (io && provider) {
    // Notify the specific provider via socket
    io.to(`provider_${provider.user._id}`).emit('new-booking-request', {
      bookingId: booking._id,
      customerName: `${req.user.firstName} ${req.user.lastName}`,
      serviceName: bookingItems[0]?.serviceName,
      scheduledDate: booking.scheduledDate,
      address: booking.serviceAddress,
      amount: booking.pricing.total,
      bookingDetails: { items: bookingItems, total: booking.pricing.total }
    });
  } else if (io && !provider) {
    // Fallback to matching logic (search nearby providers)
    const pincode = serviceAddress.pincode;
    const city = serviceAddress.city;
    let locationQuery = {};
    if (pincode) locationQuery = { 'serviceArea.pincodes': pincode };
    else if (city) locationQuery = { 'serviceArea.cities': { $regex: new RegExp(`^${city}$`, 'i') } };

    const providers = await ServiceProvider.find({
      verificationStatus: 'verified',
      isAvailable: true,
      'services.category': category,
      ...locationQuery
    }).populate('user', '_id firstName lastName phone avatar');

    let targetProviders = providers;
    if (targetProviders.length === 0) {
      targetProviders = await ServiceProvider.find({
        verificationStatus: 'verified',
        isAvailable: true,
        'services.category': category
      }).populate('user', '_id firstName lastName phone avatar');
    }

    for (const prov of targetProviders) {
      io.to(`provider_${prov.user._id}`).emit('new-booking-request', {
        bookingId: booking._id,
        customerName: `${req.user.firstName} ${req.user.lastName}`,
        serviceName: bookingItems[0]?.serviceName,
        scheduledDate: booking.scheduledDate,
        address: booking.serviceAddress,
        amount: booking.pricing.total,
        bookingDetails: { items: bookingItems, total: booking.pricing.total }
      });
    }
  }

  new ApiResponse(201, { booking }, 'Booking created successfully').send(res);
});

// @desc    Accept booking by provider (also PATCH)
// @route   POST /api/v1/bookings/:id/accept or PATCH /api/v1/bookings/:id/accept
exports.acceptBooking = asyncHandler(async (req, res) => {
  const bookingId = req.params.id;
  const providerUserId = req.user._id;
  const provider = await ServiceProvider.findOne({ user: providerUserId });
  if (!provider) throw new ApiError(404, 'Provider not found');

  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.status !== 'searching' && booking.status !== 'pending') {
    throw new ApiError(400, 'Booking already accepted or cannot be accepted');
  }

  booking.provider = provider._id;
  booking.status = 'confirmed';
  booking.acceptedAt = new Date();
  await booking.save();

  booking.timeline.push({
    status: 'confirmed',
    note: `Booking accepted by ${provider.businessName}`,
    updatedBy: req.user._id
  });
  await booking.save();

  const io = req.app.get('io');
  if (io) {
    io.to(`user_${booking.customer.toString()}`).emit('booking-accepted', {
      bookingId: booking._id,
      provider: {
        id: provider._id,
        businessName: provider.businessName,
        phone: req.user.phone,
        avatar: req.user.avatar?.url,
        name: `${req.user.firstName} ${req.user.lastName}`
      }
    });

    // Notify other providers that this booking is taken
    const allProviders = await ServiceProvider.find({ verificationStatus: 'verified' }).populate('user', '_id');
    for (const prov of allProviders) {
      if (prov.user._id.toString() !== providerUserId) {
        io.to(`provider_${prov.user._id.toString()}`).emit('booking-taken', { bookingId });
      }
    }
  }

  const Notification = require('../models/Notification');
  await Notification.create({
    recipient: booking.customer,
    type: 'booking_confirmed',
    title: 'Booking Accepted!',
    message: `Your booking ${booking.bookingId} has been accepted by ${provider.businessName}.`,
    reference: { model: 'Booking', id: booking._id },
    channels: { inApp: true, email: true }
  });

  // Send email to customer
  try {
    const customer = await User.findById(booking.customer);
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><title>Booking Accepted</title>
      <style>body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px}.container{max-width:500px;margin:0 auto;background:#fff;padding:30px;border-radius:12px}</style>
      </head>
      <body><div class="container">
        <h2>Booking Accepted!</h2>
        <p>Hello ${customer.firstName},</p>
        <p>Your booking <strong>${booking.bookingId}</strong> has been accepted by <strong>${provider.businessName}</strong>.</p>
        <p>You can now chat with the provider directly on our website.</p>
        <a href="${process.env.FRONTEND_URL}/my-bookings?openChat=${booking._id}" style="display:inline-block;background:#10b981;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;margin:20px 0">View Booking & Chat</a>
        <p>The provider will contact you soon.</p>
        <hr style="margin:20px 0">
        <p style="color:#6b7280;font-size:12px">GharSeva – Your trusted home service partner</p>
      </div></body>
      </html>
    `;
    await sendEmail({
      email: customer.email,
      subject: `Booking ${booking.bookingId} Accepted`,
      html: emailHtml
    });
  } catch (emailErr) { console.error('Failed to send booking accepted email:', emailErr); }

  new ApiResponse(200, { booking }, 'Booking accepted successfully').send(res);
});

// @desc    Get all bookings for logged in user (customer or provider)
// @route   GET /api/v1/bookings/my-bookings
exports.getMyBookings = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const query = {};
  
  if (req.user.role === 'customer') {
    query.customer = req.user._id;
  } else if (req.user.role === 'provider') {
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    if (provider) {
      query.provider = provider._id;
    } else {
      return new ApiResponse(200, { bookings: [], pagination: { page: 1, limit: 10, total: 0, pages: 0 } }, 'Bookings fetched').send(res);
    }
  }

  if (status) query.status = status;

  const bookings = await Booking.find(query)
    .populate('customer', 'firstName lastName phone email')
    .populate('provider', 'businessName rating')
    .populate('items.service', 'name')
    .sort('-createdAt')
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await Booking.countDocuments(query);

  new ApiResponse(200, {
    bookings,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  }, 'Bookings fetched successfully').send(res);
});

// @desc    Get single booking
// @route   GET /api/v1/bookings/:id
exports.getBookingById = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('customer', 'firstName lastName phone email')
    .populate('provider')
    .populate('items.service');

  if (!booking) throw new ApiError(404, 'Booking not found');

  if (req.user.role === 'customer' && booking.customer._id.toString() !== req.user._id.toString()) {
    throw new ApiError(403, 'Not authorized to view this booking');
  }
  if (req.user.role === 'provider') {
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    if (!provider || provider._id.toString() !== booking.provider._id.toString()) {
      throw new ApiError(403, 'Not authorized to view this booking');
    }
  }

  new ApiResponse(200, { booking }, 'Booking fetched successfully').send(res);
});

// @desc    Cancel booking
// @route   PATCH /api/v1/bookings/:id/cancel
exports.cancelBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, 'Booking not found');

  if (!['pending', 'confirmed'].includes(booking.status) && booking.status !== 'searching') {
    throw new ApiError(400, `Cannot cancel booking in ${booking.status} status`);
  }

  if (req.user.role === 'customer' && booking.customer.toString() !== req.user._id.toString()) {
    throw new ApiError(403, 'Not authorized to cancel this booking');
  }

  booking.status = 'cancelled';
  booking.cancellation = {
    cancelledBy: req.user.role,
    reason: req.body.reason,
    cancelledAt: new Date()
  };

  booking.timeline.push({
    status: 'cancelled',
    note: `Booking cancelled by ${req.user.role}`,
    updatedBy: req.user._id
  });

  await booking.save();

  try {
    const provider = await ServiceProvider.findById(booking.provider);
    if (provider) {
      const Notification = require('../models/Notification');
      await Notification.create({
        recipient: provider.user,
        type: 'booking_cancelled',
        title: 'Booking Cancelled',
        message: `Booking ${booking.bookingId} was cancelled by ${req.user.role}`,
        reference: { model: 'Booking', id: booking._id },
        channels: { inApp: true }
      });
    }
  } catch (err) { console.error('Failed to send cancellation notification', err); }

  new ApiResponse(200, { booking }, 'Booking cancelled successfully').send(res);
});

// @desc    Confirm booking (Provider)
// @route   PATCH /api/v1/bookings/:id/confirm
exports.confirmBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, 'Booking not found');

  const provider = await ServiceProvider.findOne({ user: req.user._id });
  if (!provider || provider._id.toString() !== booking.provider.toString()) {
    throw new ApiError(403, 'Not authorized to confirm this booking');
  }

  if (booking.status !== 'pending' && booking.status !== 'confirmed') {
    throw new ApiError(400, 'Can only confirm pending or confirmed bookings');
  }

  if (booking.status === 'pending') {
    booking.status = 'confirmed';
    booking.timeline.push({
      status: 'confirmed',
      note: 'Booking confirmed by provider',
      updatedBy: req.user._id
    });
  }
  await booking.save();

  new ApiResponse(200, { booking }, 'Booking confirmed successfully').send(res);
});

// @desc    Start service (Provider)
// @route   PATCH /api/v1/bookings/:id/start
exports.startService = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, 'Booking not found');

  const provider = await ServiceProvider.findOne({ user: req.user._id });
  if (!provider || provider._id.toString() !== booking.provider.toString()) {
    throw new ApiError(403, 'Not authorized to start this booking');
  }

  if (booking.status !== 'confirmed') {
    throw new ApiError(400, 'Can only start confirmed bookings');
  }

  booking.status = 'in_progress';
  booking.actualTimes.serviceStarted = new Date();
  booking.timeline.push({
    status: 'in_progress',
    note: 'Service started',
    updatedBy: req.user._id
  });

  await booking.save();

  new ApiResponse(200, { booking }, 'Service started').send(res);
});

// @desc    Generate completion OTP (Provider) – sends to customer email
// @route   POST /api/v1/bookings/:id/generate-otp
exports.generateCompletionOTP = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('customer', 'email firstName lastName');

  if (!booking) throw new ApiError(404, 'Booking not found');

  const provider = await ServiceProvider.findOne({ user: req.user._id });
  if (!provider || provider._id.toString() !== booking.provider.toString()) {
    throw new ApiError(403, 'Not authorized to generate OTP for this booking');
  }

  if (booking.status !== 'in_progress') {
    throw new ApiError(400, 'Can only generate OTP for in-progress bookings');
  }

  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  booking.otp = {
    code: otp,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    verified: false
  };

  await booking.save();

  try {
    const customerEmail = booking.customer.email;
    const customerName = `${booking.customer.firstName} ${booking.customer.lastName}`;
    
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><title>Service Completion OTP</title>
      <style>body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px}.container{max-width:500px;margin:0 auto;background:#fff;padding:30px;border-radius:12px}.otp-code{font-size:42px;font-weight:bold;letter-spacing:5px;background:#eef2ff;display:inline-block;padding:12px 24px;border-radius:8px;margin:20px 0}</style>
      </head>
      <body><div class="container"><h2>Hello ${customerName},</h2><p>Your service provider has requested completion of your booking <strong>${booking.bookingId}</strong>.</p><p>Please share the following OTP with the provider to complete the service:</p><div style="text-align:center"><div class="otp-code">${otp}</div></div><p>This OTP is valid for <strong>30 minutes</strong>.</p><p>If you did not request this, please ignore this email.</p><div class="footer"><p>GharSeva - Your trusted home service partner</p></div></div></body>
      </html>
    `;

    await sendEmail({
      email: customerEmail,
      subject: `Service Completion OTP for Booking ${booking.bookingId}`,
      html: emailHtml
    });

    console.log(`OTP email sent to ${customerEmail}`);
  } catch (emailErr) {
    console.error('Failed to send OTP email:', emailErr);
  }

  new ApiResponse(200, { message: 'OTP generated and sent to customer email', otp }, 'OTP generated').send(res);
});

// @desc    Complete service with OTP (Provider)
// @route   PATCH /api/v1/bookings/:id/complete
exports.completeService = asyncHandler(async (req, res) => {
  const { completionOTP } = req.body;
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, 'Booking not found');

  const provider = await ServiceProvider.findOne({ user: req.user._id });
  if (!provider || provider._id.toString() !== booking.provider.toString()) {
    throw new ApiError(403, 'Not authorized to complete this booking');
  }

  if (booking.status !== 'in_progress') {
    throw new ApiError(400, 'Can only complete in-progress bookings');
  }

  if (!booking.otp || booking.otp.code !== completionOTP) {
    throw new ApiError(400, 'Invalid or missing OTP');
  }

  if (new Date() > booking.otp.expiresAt) {
    throw new ApiError(400, 'OTP expired');
  }

  booking.status = 'completed';
  booking.otp.verified = true;
  booking.actualTimes.serviceCompleted = new Date();
  booking.timeline.push({
    status: 'completed',
    note: 'Service completed',
    updatedBy: req.user._id
  });

  await booking.save();

  // Update provider stats
  await ServiceProvider.findByIdAndUpdate(booking.provider, {
    $inc: { 'stats.completedBookings': 1, 'stats.totalEarnings': booking.pricing.total }
  });

  // Update provider rating via review post-save hook (already handled)
  new ApiResponse(200, { booking }, 'Service completed').send(res);
});

// @desc    Reschedule booking
// @route   PATCH /api/v1/bookings/:id/reschedule
exports.rescheduleBooking = asyncHandler(async (req, res) => {
  const { scheduledDate, scheduledTime } = req.body;
  const booking = await Booking.findById(req.params.id);
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

  booking.scheduledDate = scheduledDate;
  booking.scheduledTime = scheduledTime;
  booking.isRescheduled = true;
  booking.timeline.push({
    status: booking.status,
    note: 'Booking rescheduled',
    updatedBy: req.user._id
  });

  await booking.save();

  new ApiResponse(200, { booking }, 'Booking rescheduled').send(res);
});