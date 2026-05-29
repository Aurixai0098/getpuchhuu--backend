const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    unique: true
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
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubService',
    required: true
  },
  rating: {
    overall: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    punctuality: {
      type: Number,
      min: 1,
      max: 5
    },
    quality: {
      type: Number,
      min: 1,
      max: 5
    },
    behaviour: {
      type: Number,
      min: 1,
      max: 5
    },
    valueForMoney: {
      type: Number,
      min: 1,
      max: 5
    }
  },
  title: {
    type: String,
    maxlength: 100
  },
  comment: {
    type: String,
    required: true,
    maxlength: 1000
  },
  images: [{
    url: String,
    publicId: String
  }],
  providerResponse: {
    comment: String,
    respondedAt: Date
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'flagged'],
    default: 'approved'
  },
  moderationNote: String,
  helpful: {
    count: { type: Number, default: 0 },
    users: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  },
  isVerifiedPurchase: {
    type: Boolean,
    default: true
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: Date
}, { timestamps: true });

// Indexes
reviewSchema.index({ provider: 1, status: 1 });
reviewSchema.index({ service: 1, status: 1 });
reviewSchema.index({ customer: 1 });
reviewSchema.index({ 'rating.overall': -1 });
reviewSchema.index({ createdAt: -1 });

// Update provider rating after save
reviewSchema.post('save', async function() {
  const Review = this.constructor;
  const ServiceProvider = mongoose.model('ServiceProvider');
  
  const stats = await Review.aggregate([
    { $match: { provider: this.provider, status: 'approved' } },
    {
      $group: {
        _id: '$provider',
        avgRating: { $avg: '$rating.overall' },
        count: { $sum: 1 },
        five: { $sum: { $cond: [{ $eq: ['$rating.overall', 5] }, 1, 0] } },
        four: { $sum: { $cond: [{ $eq: ['$rating.overall', 4] }, 1, 0] } },
        three: { $sum: { $cond: [{ $eq: ['$rating.overall', 3] }, 1, 0] } },
        two: { $sum: { $cond: [{ $eq: ['$rating.overall', 2] }, 1, 0] } },
        one: { $sum: { $cond: [{ $eq: ['$rating.overall', 1] }, 1, 0] } }
      }
    }
  ]);
  
  if (stats.length > 0) {
    await ServiceProvider.findByIdAndUpdate(this.provider, {
      'rating.average': Math.round(stats[0].avgRating * 10) / 10,
      'rating.count': stats[0].count,
      'rating.breakdown': {
        five: stats[0].five,
        four: stats[0].four,
        three: stats[0].three,
        two: stats[0].two,
        one: stats[0].one
      }
    });
  }
});

const Review = mongoose.model('Review', reviewSchema);
module.exports = Review;