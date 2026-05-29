const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ServiceProvider',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,
  status: {
    type: String,
    enum: ['created', 'attempted', 'paid', 'failed', 'refunded', 'partially_refunded'],
    default: 'created'
  },
  method: {
    type: String,
    enum: ['online', 'upi', 'card', 'netbanking', 'wallet', 'cod', 'other'],  // ✅ 'online' ADDED
    default: 'online'  // ✅ Default changed to 'online'
  },
  refund: {
    refundId: String,
    amount: Number,
    status: {
      type: String,
      enum: ['pending', 'processed', 'failed'],
      default: 'pending'
    },
    reason: String,
    processedAt: Date
  },
  commission: {
    percentage: {
      type: Number,
      default: 20
    },
    amount: Number,
    providerEarning: Number
  },
  receipt: String,
  notes: String,
  metadata: {
    type: Map,
    of: String
  }
}, {
  timestamps: true
});

// Generate receipt number
paymentSchema.pre('save', function() {
    if (this.isNew) {
        const date = new Date();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        this.receipt = `RCPT-${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}-${random}`;
    }
});

// Indexes
paymentSchema.index({ booking: 1 });
paymentSchema.index({ customer: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ razorpayOrderId: 1 }, { unique: true, sparse: true });

const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment;