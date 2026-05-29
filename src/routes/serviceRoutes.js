const express = require('express');
const serviceController = require('../controllers/serviceController');

const router = express.Router();

// Category routes
router.get('/categories', serviceController.getCategories);
router.get('/categories/:slug', serviceController.getCategoryBySlug);

// Service routes
router.get('/', serviceController.getServices);
router.get('/featured', serviceController.getFeaturedServices);
router.get('/popular', serviceController.getPopularServices);
router.get('/search', serviceController.searchServices);
router.get('/:slug', serviceController.getServiceBySlug);

module.exports = router;