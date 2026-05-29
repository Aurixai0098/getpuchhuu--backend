const mongoose = require('mongoose');
const slugify = require('slugify');

const pricingTierSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  price: {
    type: Number,
    required: true,
    min: 0
  },
  duration: {
    type: Number,
    required: true
  },
  includes: [String]
}, { _id: true });

const faqSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true
  },
  answer: {
    type: String,
    required: true
  }
}, { _id: true });

const subServiceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Service name is required'],
    trim: true,
    maxlength: 100
  },
  nameHindi: String,
  slug: {
    type: String,
    unique: true
  },
  description: {
    type: String,
    required: true,
    maxlength: 1000
  },
  shortDescription: {
    type: String,
    maxlength: 200
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  icon: {
    url: String,
    publicId: String
  },
  images: [{
    url: String,
    publicId: String,
    caption: String
  }],
  pricingType: {
    type: String,
    enum: ['fixed', 'hourly', 'custom', 'quote'],
    default: 'fixed'
  },
  basePrice: {
    type: Number,
    required: true,
    min: 0
  },
  priceUnit: {
    type: String,
    enum: ['per_service', 'per_hour', 'per_sqft', 'per_unit'],
    default: 'per_service'
  },
  pricingTiers: [pricingTierSchema],
  estimatedDuration: {
    min: { type: Number, required: true },
    max: { type: Number, required: true }
  },
  includes: [String],
  excludes: [String],
  requirements: [String],
  faqs: [faqSchema],
  tags: [String],
  isActive: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  bookingsCount: {
    type: Number,
    default: 0
  },
  rating: {
    average: { type: Number, default: 0 },
    count: { type: Number, default: 0 }
  },
  metaTitle: String,
  metaDescription: String
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save middleware
subServiceSchema.pre('save', function() {
    if (this.isModified('name')) {
        this.slug = slugify(this.name, { lower: true, strict: true });
    }
});

// Indexes
subServiceSchema.index({ category: 1, isActive: 1 });
// subServiceSchema.index({ slug: 1 });
subServiceSchema.index({ tags: 1 });
subServiceSchema.index({ '$**': 'text' });

const SubService = mongoose.model('SubService', subServiceSchema);
module.exports = SubService;