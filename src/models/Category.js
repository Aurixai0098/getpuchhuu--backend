const mongoose = require('mongoose');
const slugify = require('slugify');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    unique: true,
    trim: true,
    maxlength: 50
  },
  nameHindi: {
    type: String,
    trim: true
  },
  slug: {
    type: String,
    unique: true
  },
  description: {
    type: String,
    maxlength: 500
  },
  icon: {
    url: String,
    publicId: String
  },
  image: {
    url: String,
    publicId: String
  },
  color: {
    type: String,
    default: '#000000'
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  metaTitle: String,
  metaDescription: String,
  metaKeywords: [String]
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for subcategories
categorySchema.virtual('subCategories', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parent'
});

// Virtual for services count
categorySchema.virtual('servicesCount', {
  ref: 'SubService',
  localField: '_id',
  foreignField: 'category',
  count: true
});

// Pre-save middleware for slug
categorySchema.pre('save', function() {
    if (this.isModified('name')) {
        this.slug = slugify(this.name, { lower: true, strict: true });
    }
    // Mongoose 7+ me next() ki zaroorat nahi
});

// Indexes
// categorySchema.index({ slug: 1 });
categorySchema.index({ parent: 1 });
categorySchema.index({ isActive: 1, sortOrder: 1 });

const Category = mongoose.model('Category', categorySchema);
module.exports = Category;