const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  senderRole: {
    type: String,
    enum: ['customer', 'provider'],
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['text', 'image'],
    default: 'text',
  },
  imageUrl: {
    type: String,
    default: null,
  },
  readAt: Date,
}, { timestamps: true });

chatSchema.index({ booking: 1, createdAt: -1 });

module.exports = mongoose.model('Chat', chatSchema);