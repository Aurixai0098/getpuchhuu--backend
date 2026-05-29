const Category = require('../models/Category');
const SubService = require('../models/SubService');
const Review = require('../models/Review');
const ServiceProvider = require('../models/ServiceProvider');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

// Helper: Get reviews for a service
const getServiceReviews = async (serviceId, limit = 10) => {
  return await Review.find({ service: serviceId, status: 'approved' })
    .populate('customer', 'firstName lastName avatar')
    .sort('-createdAt')
    .limit(limit);
};

// @desc    Get all categories
// @route   GET /api/v1/services/categories
exports.getCategories = asyncHandler(async (req, res) => {
    const categories = await Category.find({ 
        isActive: true,
        parent: null 
    })
    .populate('subCategories')
    .sort('sortOrder');
    
    new ApiResponse(200, { categories }, 'Categories fetched').send(res);
});

// @desc    Get single category with subcategories and services with rating stats
// @route   GET /api/v1/services/categories/:slug
exports.getCategoryBySlug = asyncHandler(async (req, res) => {
    const category = await Category.findOne({ 
        slug: req.params.slug,
        isActive: true 
    }).populate('subCategories');
    
    if (!category) {
        throw new ApiError(404, 'Category not found');
    }
    
    // Get services under this category
    let services = await SubService.find({
        category: category._id,
        isActive: true
    }).sort('sortOrder');
    
    // Fetch aggregated category rating stats
    const serviceIds = services.map(s => s._id);
    let ratingStats = { average: 0, count: 0, five: 0, four: 0, three: 0, two: 0, one: 0 };
    
    if (serviceIds.length > 0) {
        const categoryStats = await Review.aggregate([
            { $match: { service: { $in: serviceIds }, status: 'approved' } },
            {
                $group: {
                    _id: null,
                    average: { $avg: '$rating.overall' },
                    count: { $sum: 1 },
                    five: { $sum: { $cond: [{ $eq: ['$rating.overall', 5] }, 1, 0] } },
                    four: { $sum: { $cond: [{ $eq: ['$rating.overall', 4] }, 1, 0] } },
                    three: { $sum: { $cond: [{ $eq: ['$rating.overall', 3] }, 1, 0] } },
                    two: { $sum: { $cond: [{ $eq: ['$rating.overall', 2] }, 1, 0] } },
                    one: { $sum: { $cond: [{ $eq: ['$rating.overall', 1] }, 1, 0] } }
                }
            }
        ]);
        if (categoryStats.length > 0) {
            ratingStats = categoryStats[0];
        }
    }

    // Attach rating stats from Review model to each individual service
    const servicesWithRating = await Promise.all(services.map(async (service) => {
        const stats = await Review.aggregate([
            { $match: { service: service._id, status: 'approved' } },
            {
                $group: {
                    _id: null,
                    avgRating: { $avg: '$rating.overall' },
                    count: { $sum: 1 }
                }
            }
        ]);
        const serviceObj = service.toObject();
        serviceObj.rating = {
            average: stats[0]?.avgRating || 0,
            count: stats[0]?.count || 0
        };
        return serviceObj;
    }));
    
    // Send category, services, and the new aggregate ratingStats
    new ApiResponse(200, { category, services: servicesWithRating, ratingStats }, 'Category fetched').send(res);
});

// @desc    Get all services
// @route   GET /api/v1/services
exports.getServices = asyncHandler(async (req, res) => {
    const { category, search, page = 1, limit = 10 } = req.query;
    
    const query = { isActive: true };
    
    if (category) {
        const cat = await Category.findOne({ slug: category });
        if (cat) {
            query.category = cat._id;
        }
    }
    
    if (search) {
        query.$text = { $search: search };
    }
    
    const services = await SubService.find(query)
        .populate('category', 'name slug')
        .sort('sortOrder')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));
    
    const total = await SubService.countDocuments(query);
    
    new ApiResponse(200, {
        services,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        }
    }, 'Services fetched').send(res);
});

// @desc    Get single service with reviews
// @route   GET /api/v1/services/:slug
exports.getServiceBySlug = asyncHandler(async (req, res) => {
    const service = await SubService.findOne({ 
        slug: req.params.slug,
        isActive: true 
    }).populate('category', 'name slug');
    
    if (!service) {
        throw new ApiError(404, 'Service not found');
    }
    
    // Get real reviews
    const reviews = await getServiceReviews(service._id, 10);
    
    // Get rating stats from reviews
    const ratingStats = await Review.aggregate([
        { $match: { service: service._id, status: 'approved' } },
        {
            $group: {
                _id: null,
                average: { $avg: '$rating.overall' },
                count: { $sum: 1 }
            }
        }
    ]);
    
    // Get related services
    const relatedServices = await SubService.find({
        category: service.category,
        _id: { $ne: service._id },
        isActive: true
    }).limit(5);
    
    // Get providers for this service
    const providers = await ServiceProvider.find({
        'services.subServices': service._id,
        verificationStatus: 'verified',
        isAvailable: true
    })
        .populate('user', 'firstName lastName avatar')
        .limit(10);
    
    // Prepare service object with rating and reviews
    const serviceObj = service.toObject();
    serviceObj.rating = {
        average: ratingStats[0]?.average || 0,
        count: ratingStats[0]?.count || 0
    };
    
    new ApiResponse(200, {
        service: serviceObj,
        relatedServices,
        providers,
        reviews
    }, 'Service fetched').send(res);
});

// @desc    Get featured services
// @route   GET /api/v1/services/featured
exports.getFeaturedServices = asyncHandler(async (req, res) => {
    const services = await SubService.find({
        isActive: true,
        isFeatured: true
    })
        .populate('category', 'name slug')
        .limit(8);
    
    new ApiResponse(200, { services }, 'Featured services fetched').send(res);
});

// @desc    Search services
// @route   GET /api/v1/services/search
exports.searchServices = asyncHandler(async (req, res) => {
    const { q, category } = req.query;
    
    const query = { isActive: true };
    
    if (q) {
        query.$or = [
            { name: { $regex: q, $options: 'i' } },
            { description: { $regex: q, $options: 'i' } },
            { tags: { $in: [new RegExp(q, 'i')] } }
        ];
    }
    
    if (category) {
        const cat = await Category.findOne({ slug: category });
        if (cat) {
            query.category = cat._id;
        }
    }
    
    const services = await SubService.find(query)
        .populate('category', 'name slug')
        .limit(20);
    
    new ApiResponse(200, { services, count: services.length }, 'Search results').send(res);
});

// @desc    Get popular services
// @route   GET /api/v1/services/popular
exports.getPopularServices = asyncHandler(async (req, res) => {
    const services = await SubService.find({ isActive: true })
        .sort('-bookingsCount -rating.average')
        .limit(10)
        .populate('category', 'name slug');
    
    new ApiResponse(200, { services }, 'Popular services fetched').send(res);
});