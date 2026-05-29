const mongoose = require('mongoose');

const bookingItemSchema = new mongoose.Schema({
  service: { type: mongoose.Schema.Types.ObjectId, ref: 'SubService', required: true },
  serviceName: String,
  pricingTier: { type: mongoose.Schema.Types.ObjectId },
  quantity: { type: Number, default: 1, min: 1 },
  unitPrice: { type: Number, required: true },
  totalPrice: { type: Number, required: true },
  notes: String
}, { _id: true });

const timelineEventSchema = new mongoose.Schema({
  status: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  note: String,
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: false });

const bookingSchema = new mongoose.Schema({
  bookingId: { type: String, unique: true, required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  provider: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceProvider', default: null },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  items: [bookingItemSchema],
  scheduledDate: { type: Date, required: true },
  scheduledTime: { start: { type: String, required: true }, end: String },
  estimatedDuration: Number,
  serviceAddress: {
    street: { type: String, required: true },
    landmark: String,
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    coordinates: { latitude: Number, longitude: Number }
  },
  // New: customer problem description and images
  customerProblem: {
    description: { type: String, default: '' },
    images: [{ url: String, publicId: String }]
  },
  // New: provider offer (counter-offer)
  providerOffer: {
    amount: { type: Number, default: null },
    note: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'accepted_by_customer', 'rejected_by_customer', 'expired'], default: 'pending' },
    offeredAt: Date
  },
  status: {
    type: String,
    enum: [
      'pending',           // waiting for provider to review
      'offer_pending',     // provider sent offer, waiting customer
      'confirmed',         // customer accepted offer
      'in_progress',
      'completed',
      'cancelled',
      'refunded',
      'searching'
    ],
    default: 'pending'
  },
  cancellation: {
    cancelledBy: { type: String, enum: ['customer', 'provider', 'admin', 'system'] },
    reason: String,
    cancelledAt: Date,
    refundAmount: Number
  },
  pricing: {
    subtotal: { type: Number, required: true },
    discount: { code: String, amount: { type: Number, default: 0 } },
    taxes: { gst: { type: Number, default: 0 }, sgst: { type: Number, default: 0 }, cgst: { type: Number, default: 0 } },
    convenienceFee: { type: Number, default: 0 },
    total: { type: Number, required: true }
  },
  payment: {
    method: { type: String, enum: ['online', 'cod', 'wallet'], required: true },
    status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded', 'partial_refund'], default: 'pending' },
    transactionId: String,
    paidAt: Date,
    paidAmount: Number
  },
  otp: { code: String, expiresAt: Date, verified: { type: Boolean, default: false } },
  offers: [{ provider: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceProvider' }, offeredAt: Date, status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' } }],
  actualTimes: { providerArrived: Date, serviceStarted: Date, serviceCompleted: Date },
  customerNotes: String,
  providerNotes: String,
  adminNotes: String,
  timeline: [timelineEventSchema],
  isRescheduled: { type: Boolean, default: false },
  rescheduledFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  hasReviewed: { type: Boolean, default: false }
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

bookingSchema.pre('save', async function() {
  if (this.isNew && !this.bookingId) {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.bookingId = `BK${dateStr}${randomStr}`;
  }
});

bookingSchema.index({ customer: 1, status: 1 });
bookingSchema.index({ provider: 1, status: 1 });
bookingSchema.index({ scheduledDate: 1 });
bookingSchema.index({ status: 1, createdAt: -1 });
bookingSchema.index({ 'payment.status': 1 });

const Booking = mongoose.model('Booking', bookingSchema);
module.exports = Booking;