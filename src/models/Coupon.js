const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  description: String,
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true
  },
  discountValue: {
    type: Number,
    required: true,
    min: 0
  },
  minOrderAmount: {
    type: Number,
    default: 0
  },
  maxDiscount: Number,
  applicableFor: {
    users: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    categories: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category'
    }],
    services: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubService'
    }],
    userType: {
      type: String,
      enum: ['all', 'new', 'existing'],
      default: 'all'
    }
  },
  usageLimit: {
    perUser: {
      type: Number,
      default: 1
    },
    total: {
      type: Number,
      default: 100
    }
  },
  usedCount: {
    type: Number,
    default: 0
  },
  validFrom: {
    type: Date,
    required: true
  },
  validUntil: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
// couponSchema.index({ code: 1 });
couponSchema.index({ validFrom: 1, validUntil: 1 });
couponSchema.index({ isActive: 1 });

// Methods
couponSchema.methods.isExpired = function() {
  const now = new Date();
  return now < this.validFrom || now > this.validUntil;
};

couponSchema.methods.isUsageLimitReached = function() {
  return this.usedCount >= this.usageLimit.total;
};

const Coupon = mongoose.model('Coupon', couponSchema);
module.exports = Coupon;