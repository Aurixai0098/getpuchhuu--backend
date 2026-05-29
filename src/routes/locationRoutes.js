// src/routes/locationRoutes.js
const express = require('express');
const { protect } = require('../middleware/auth');
const locationController = require('../controllers/locationController');

const router = express.Router();
router.use(protect);

router.get('/:bookingId', locationController.getProviderLocations);

module.exports = router;