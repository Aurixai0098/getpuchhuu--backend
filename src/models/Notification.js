const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'booking',           // general booking notifications (created, accepted, confirmed, offer, etc.)
      'booking_offer',     // provider sent a price offer
      'booking_confirmed', // customer accepted offer
      'message',           // chat messages
      'alert',             // system alerts
      'system',            // general system messages (cancellation, etc.)
      'payment',           // payment related
      'profile_verified',  // KYC verified
      'profile_rejected'   // KYC rejected
    ],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  reference: {
    model: {
      type: String,
      enum: ['Booking', 'Payment', 'Review', 'ServiceProvider', 'User']
    },
    id: mongoose.Schema.Types.ObjectId
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  channels: {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    sms: { type: Boolean, default: false },
    push: { type: Boolean, default: false }
  }
}, {
  timestamps: true
});

// Indexes
notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ type: 1 });

// Auto-delete after 30 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const Notification = mongoose.model('Notification', notificationSchema);
module.exports = Notification;