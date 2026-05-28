// controllers/bookingController.js
const Booking = require('../models/Booking');
const ServiceProvider = require('../models/ServiceProvider');
const SubService = require('../models/SubService');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { sendEmail, emailTemplates } = require('../utils/sendEmail');
const { uploadToCloudinary } = require('../config/cloudinary');

const roundTo2 = (num) => Math.round(num * 100) / 100;

// Helper to safely parse JSON fields
const safeJSONParse = (str, fieldName) => {
  try {
    return typeof str === 'string' ? JSON.parse(str) : str;
  } catch (err) {
    throw new ApiError(400, `Invalid JSON format for ${fieldName}`);
  }
};

// @desc    Create new booking with problem description and images
// @route   POST /api/v1/bookings
exports.createBooking = asyncHandler(async (req, res) => {
  const services = safeJSONParse(req.body.services, 'services');
  const scheduledTime = safeJSONParse(req.body.scheduledTime, 'scheduledTime');
  const serviceAddress = safeJSONParse(req.body.serviceAddress, 'serviceAddress');
  const payment = safeJSONParse(req.body.payment, 'payment');

  const scheduledDate = req.body.scheduledDate;
  const notes = req.body.notes;
  const category = req.body.category;
  const providerId = req.body.providerId;
  const problemDescription = req.body.problemDescription;

  if (!services || !Array.isArray(services)) throw new ApiError(400, 'Services must be an array');
  if (!scheduledTime || !scheduledTime.start) throw new ApiError(400, 'scheduledTime.start is required');
  if (!serviceAddress || !serviceAddress.street || !serviceAddress.city || !serviceAddress.state || !serviceAddress.pincode) {
    throw new ApiError(400, 'Complete service address is required');
  }
  if (!payment || !payment.method || !['online', 'cod', 'wallet'].includes(payment.method)) {
    throw new ApiError(400, 'Valid payment method is required');
  }

  let images = [];
  if (req.files && req.files.length) {
    for (let i = 0; i < Math.min(req.files.length, 3); i++) {
      const result = await uploadToCloudinary(req.files[i].buffer, 'gharseva/booking-issues');
      images.push({ url: result.secure_url, publicId: result.public_id });
    }
  }

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
    customerProblem: { description: problemDescription || '', images },
    status: provider ? 'pending' : 'searching'
  });

  booking.timeline.push({
    status: provider ? 'pending' : 'searching',
    note: provider ? 'Waiting for provider to review and propose price' : 'Searching for nearby providers',
    updatedBy: req.user._id
  });
  await booking.save();

  try {
    await sendEmail({
      email: req.user.email,
      subject: `Booking Created - ${booking.bookingId}`,
      html: emailTemplates.bookingConfirmation(booking)
    });
  } catch (error) { console.error('Failed to send booking email:', error); }

  const Notification = require('../models/Notification');
  await Notification.create({
    recipient: req.user._id,
    type: 'booking',
    title: 'Booking Created',
    message: `Your booking ${booking.bookingId} has been created. ${provider ? 'Waiting for provider to propose price.' : 'Searching for a provider...'}`,
    reference: { model: 'Booking', id: booking._id },
    channels: { inApp: true, email: true }
  });

  const io = req.app.get('io');
  if (io && provider) {
    io.to(`provider_${provider.user._id}`).emit('new-booking-request', {
      bookingId: booking._id,
      customerName: `${req.user.firstName} ${req.user.lastName}`,
      serviceName: bookingItems[0]?.serviceName,
      scheduledDate: booking.scheduledDate,
      address: booking.serviceAddress,
      problemDescription: problemDescription,
      hasImages: images.length > 0,
      amount: booking.pricing.total,
      bookingDetails: { items: bookingItems, total: booking.pricing.total }
    });
  } else if (io && !provider) {
    const targetProviders = await ServiceProvider.find({
      verificationStatus: 'verified',
      isAvailable: true,
      'services.category': category
    }).populate('user', '_id firstName lastName phone avatar');
    for (const prov of targetProviders) {
      io.to(`provider_${prov.user._id}`).emit('new-booking-request', {
        bookingId: booking._id,
        customerName: `${req.user.firstName} ${req.user.lastName}`,
        serviceName: bookingItems[0]?.serviceName,
        scheduledDate: booking.scheduledDate,
        address: booking.serviceAddress,
        problemDescription: problemDescription,
        hasImages: images.length > 0,
        amount: booking.pricing.total,
        bookingDetails: { items: bookingItems, total: booking.pricing.total }
      });
    }
  }

  new ApiResponse(201, { booking }, 'Booking created successfully').send(res);
});

// @desc    Provider proposes price (accepts with amount)
// @route   POST /api/v1/bookings/:id/provider-offer
exports.providerOffer = asyncHandler(async (req, res) => {
  const { amount, note } = req.body;
  if (!amount || amount <= 0) throw new ApiError(400, 'Valid amount is required');
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, 'Booking not found');
  const provider = await ServiceProvider.findOne({ user: req.user._id });
  if (!provider || booking.provider.toString() !== provider._id.toString()) {
    throw new ApiError(403, 'Not authorized');
  }
  if (booking.status !== 'pending') {
    throw new ApiError(400, 'Booking already processed');
  }
  booking.providerOffer = {
    amount: roundTo2(amount),
    note: note || '',
    status: 'pending',
    offeredAt: new Date()
  };
  booking.status = 'offer_pending';
  booking.timeline.push({
    status: 'offer_pending',
    note: `Provider offered ₹${amount}. Awaiting customer confirmation.`,
    updatedBy: req.user._id
  });
  await booking.save();

  const Notification = require('../models/Notification');
  await Notification.create({
    recipient: booking.customer,
    type: 'booking_offer',
    title: 'Provider has made an offer',
    message: `Provider offered ₹${amount} for your booking. Please confirm or cancel.`,
    reference: { model: 'Booking', id: booking._id },
    channels: { inApp: true, email: true }
  });

  const io = req.app.get('io');
  if (io) {
    io.to(`user_${booking.customer.toString()}`).emit('booking-offer', {
      bookingId: booking._id,
      amount,
      note
    });
  }

  new ApiResponse(200, { booking }, 'Offer sent to customer').send(res);
});

// @desc    Customer confirms provider's offer (accepts price)
// @route   POST /api/v1/bookings/:id/confirm-offer
exports.confirmOffer = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.customer.toString() !== req.user._id.toString()) throw new ApiError(403, 'Not authorized');
  if (booking.status !== 'offer_pending') throw new ApiError(400, 'No pending offer to confirm');
  const offeredAmount = booking.providerOffer.amount;
  const subtotal = offeredAmount;
  const gst = roundTo2(subtotal * 0.09);
  const sgst = roundTo2(subtotal * 0.09);
  const convenienceFee = roundTo2(subtotal * 0.05);
  const total = roundTo2(subtotal + gst + sgst + convenienceFee);
  booking.pricing.subtotal = subtotal;
  booking.pricing.taxes = { gst, sgst, cgst: 0 };
  booking.pricing.convenienceFee = convenienceFee;
  booking.pricing.total = total;
  booking.status = 'confirmed';
  booking.providerOffer.status = 'accepted_by_customer';
  booking.timeline.push({
    status: 'confirmed',
    note: `Customer accepted provider's offer of ₹${offeredAmount}`,
    updatedBy: req.user._id
  });
  await booking.save();

  const Notification = require('../models/Notification');
  const providerUser = await ServiceProvider.findById(booking.provider).populate('user');
  await Notification.create({
    recipient: providerUser.user._id,
    type: 'booking_confirmed',
    title: 'Booking Confirmed',
    message: `Customer accepted your offer of ₹${offeredAmount} for booking ${booking.bookingId}.`,
    reference: { model: 'Booking', id: booking._id },
    channels: { inApp: true, email: true }
  });

  const io = req.app.get('io');
  if (io) io.to(`provider_${providerUser.user._id.toString()}`).emit('booking-confirmed', { bookingId: booking._id });

  new ApiResponse(200, { booking }, 'Booking confirmed. Proceed to schedule.').send(res);
});

// @desc    Customer rejects provider's offer
// @route   POST /api/v1/bookings/:id/reject-offer
exports.rejectOffer = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.customer.toString() !== req.user._id.toString()) throw new ApiError(403, 'Not authorized');
  if (booking.status !== 'offer_pending') throw new ApiError(400, 'No pending offer');
  booking.status = 'cancelled';
  booking.providerOffer.status = 'rejected_by_customer';
  booking.cancellation = { cancelledBy: 'customer', reason: 'Rejected provider offer', cancelledAt: new Date() };
  booking.timeline.push({ status: 'cancelled', note: 'Customer rejected provider offer. Booking cancelled.', updatedBy: req.user._id });
  await booking.save();
  new ApiResponse(200, { booking }, 'Booking cancelled').send(res);
});

// @desc    Cancel booking (with 2-hour restriction)
// @route   PATCH /api/v1/bookings/:id/cancel
exports.cancelBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (!['pending', 'offer_pending', 'confirmed'].includes(booking.status)) {
    throw new ApiError(400, 'Cannot cancel booking at this stage');
  }
  const scheduledDateTime = new Date(booking.scheduledDate);
  const [hour, minute] = (booking.scheduledTime.start || '00:00').split(':');
  scheduledDateTime.setHours(parseInt(hour), parseInt(minute), 0);
  const now = new Date();
  const hoursDiff = (scheduledDateTime - now) / (1000 * 60 * 60);
  if (hoursDiff < 2) {
    throw new ApiError(400, 'Cancellation allowed only up to 2 hours before scheduled service time.');
  }
  booking.status = 'cancelled';
  booking.cancellation = {
    cancelledBy: req.user.role === 'customer' ? 'customer' : 'provider',
    reason: req.body.reason,
    cancelledAt: new Date()
  };
  booking.timeline.push({ status: 'cancelled', note: `Booking cancelled by ${req.user.role}`, updatedBy: req.user._id });
  await booking.save();

  const Notification = require('../models/Notification');
  const otherParty = req.user.role === 'customer' ? booking.provider.user : booking.customer;
  await Notification.create({
    recipient: otherParty,
    type: 'system',
    title: 'Booking Cancelled',
    message: `Booking ${booking.bookingId} has been cancelled.`,
    reference: { model: 'Booking', id: booking._id },
    channels: { inApp: true, email: true }
  });

  new ApiResponse(200, { booking }, 'Booking cancelled successfully').send(res);
});

// @desc    Accept booking by provider
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
    type: 'booking',
    title: 'Booking Accepted!',
    message: `Your booking ${booking.bookingId} has been accepted by ${provider.businessName}.`,
    reference: { model: 'Booking', id: booking._id },
    channels: { inApp: true, email: true }
  });

  try {
    const customer = await User.findById(booking.customer);
    const emailHtml = `<h2>Booking Accepted!</h2><p>Hello ${customer.firstName},</p><p>Your booking <strong>${booking.bookingId}</strong> has been accepted by <strong>${provider.businessName}</strong>.</p>`;
    await sendEmail({ email: customer.email, subject: `Booking ${booking.bookingId} Accepted`, html: emailHtml });
  } catch (emailErr) { console.error('Failed to send booking accepted email:', emailErr); }

  new ApiResponse(200, { booking }, 'Booking accepted successfully').send(res);
});

// @desc    Get all bookings for logged in user (customer or provider)
exports.getMyBookings = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const query = {};
  if (req.user.role === 'customer') query.customer = req.user._id;
  else if (req.user.role === 'provider') {
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    if (provider) query.provider = provider._id;
    else return new ApiResponse(200, { bookings: [], pagination: { page: 1, limit: 10, total: 0, pages: 0 } }, 'Bookings fetched').send(res);
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
    pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
  }, 'Bookings fetched successfully').send(res);
});

// @desc    Get single booking
exports.getBookingById = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('customer', 'firstName lastName phone email')
    .populate('provider')
    .populate('items.service');
  if (!booking) throw new ApiError(404, 'Booking not found');
  new ApiResponse(200, { booking }, 'Booking fetched').send(res);
});

// @desc    Confirm booking (Provider)
exports.confirmBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, 'Booking not found');
  const provider = await ServiceProvider.findOne({ user: req.user._id });
  if (!provider || provider._id.toString() !== booking.provider.toString()) throw new ApiError(403);
  if (booking.status !== 'pending' && booking.status !== 'confirmed') throw new ApiError(400);
  if (booking.status === 'pending') {
    booking.status = 'confirmed';
    booking.timeline.push({ status: 'confirmed', note: 'Booking confirmed by provider', updatedBy: req.user._id });
  }
  await booking.save();
  new ApiResponse(200, { booking }, 'Booking confirmed').send(res);
});

// @desc    Start service
exports.startService = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, 'Booking not found');
  const provider = await ServiceProvider.findOne({ user: req.user._id });
  if (!provider || provider._id.toString() !== booking.provider.toString()) throw new ApiError(403);
  if (booking.status !== 'confirmed') throw new ApiError(400);
  booking.status = 'in_progress';
  booking.actualTimes.serviceStarted = new Date();
  booking.timeline.push({ status: 'in_progress', note: 'Service started', updatedBy: req.user._id });
  await booking.save();
  new ApiResponse(200, { booking }, 'Service started').send(res);
});

// ✅ FIXED: Generate completion OTP AND SEND EMAIL
// @desc    Generate completion OTP and send to customer email
// @route   POST /api/v1/bookings/:id/generate-otp
exports.generateCompletionOTP = asyncHandler(async (req, res) => {
  // Populate customer details including email
  const booking = await Booking.findById(req.params.id).populate('customer', 'email firstName lastName');
  if (!booking) throw new ApiError(404, 'Booking not found');

  const provider = await ServiceProvider.findOne({ user: req.user._id });
  if (!provider || provider._id.toString() !== booking.provider.toString()) {
    throw new ApiError(403, 'Not authorized');
  }
  if (booking.status !== 'in_progress') {
    throw new ApiError(400, 'Can only generate OTP for in-progress bookings');
  }

  // Generate 4-digit OTP
  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  booking.otp = {
    code: otp,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
    verified: false
  };
  await booking.save();

  // Prepare email content
  const customerEmail = booking.customer.email;
  const customerName = `${booking.customer.firstName} ${booking.customer.lastName}`;
  const bookingId = booking.bookingId;

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Service Completion OTP</title>
      <style>
        body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
        .container { max-width: 500px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .otp-code { font-size: 42px; font-weight: bold; letter-spacing: 5px; background: #eef2ff; display: inline-block; padding: 12px 24px; border-radius: 8px; margin: 20px 0; }
        .footer { margin-top: 20px; font-size: 12px; color: #6b7280; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>Hello ${customerName},</h2>
        <p>Your service provider has requested completion of your booking <strong>${bookingId}</strong>.</p>
        <p>Please share the following OTP with the provider to complete the service:</p>
        <div style="text-align:center">
          <div class="otp-code">${otp}</div>
        </div>
        <p>This OTP is valid for <strong>30 minutes</strong>.</p>
        <p>If you did not request this, please ignore this email.</p>
        <div class="footer">
          <p>GharSeva - Your trusted home service partner</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Send email
  let emailSent = false;
  try {
    await sendEmail({
      email: customerEmail,
      subject: `Service Completion OTP for Booking ${bookingId}`,
      html: emailHtml
    });
    emailSent = true;
    console.log(`✅ OTP email sent to ${customerEmail} for booking ${bookingId}`);
  } catch (emailErr) {
    console.error(`❌ Failed to send OTP email to ${customerEmail}:`, emailErr.message);
    // Continue – we still return the OTP to provider as fallback
  }

  // Return OTP to provider (so they can read it aloud if email fails)
  new ApiResponse(200, {
    message: emailSent ? 'OTP sent to customer email' : 'OTP generated but email failed. Please ask customer to check spam or read OTP aloud.',
    otp: otp,
    emailSent
  }, 'OTP generated').send(res);
});

// @desc    Complete service with OTP
// @route   PATCH /api/v1/bookings/:id/complete
exports.completeService = asyncHandler(async (req, res) => {
  const { completionOTP } = req.body;
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, 'Booking not found');
  const provider = await ServiceProvider.findOne({ user: req.user._id });
  if (!provider || provider._id.toString() !== booking.provider.toString()) throw new ApiError(403);
  if (booking.status !== 'in_progress') throw new ApiError(400);
  if (!booking.otp || booking.otp.code !== completionOTP) throw new ApiError(400, 'Invalid OTP');
  if (new Date() > booking.otp.expiresAt) throw new ApiError(400, 'OTP expired');
  booking.status = 'completed';
  booking.otp.verified = true;
  booking.actualTimes.serviceCompleted = new Date();
  booking.timeline.push({ status: 'completed', note: 'Service completed', updatedBy: req.user._id });
  await booking.save();
  await ServiceProvider.findByIdAndUpdate(booking.provider, {
    $inc: { 'stats.completedBookings': 1, 'stats.totalEarnings': booking.pricing.total }
  });
  new ApiResponse(200, { booking }, 'Service completed').send(res);
});

// @desc    Reschedule booking
exports.rescheduleBooking = asyncHandler(async (req, res) => {
  const { scheduledDate, scheduledTime } = req.body;
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (req.user.role === 'customer' && booking.customer.toString() !== req.user._id.toString()) throw new ApiError(403);
  if (req.user.role === 'provider') {
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    if (!provider || provider._id.toString() !== booking.provider.toString()) throw new ApiError(403);
  }
  booking.scheduledDate = scheduledDate;
  booking.scheduledTime = scheduledTime;
  booking.isRescheduled = true;
  booking.timeline.push({ status: booking.status, note: 'Booking rescheduled', updatedBy: req.user._id });
  await booking.save();
  new ApiResponse(200, { booking }, 'Booking rescheduled').send(res);
});