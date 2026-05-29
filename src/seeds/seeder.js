require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Import all models
const User = require('../models/User');
const ServiceProvider = require('../models/ServiceProvider');
const Category = require('../models/Category');
const SubService = require('../models/SubService');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const Payment = require('../models/Payment');
const Wallet = require('../models/Wallet');
const Notification = require('../models/Notification');
const Coupon = require('../models/Coupon');

// Import data files
const { categories, services } = require('./data/categoriesServices');
const { users, providers } = require('./data/usersProviders');
const { coupons } = require('./data/coupons');

// Connect to database
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ghar_seva');
        console.log(`📦 MongoDB Connected: ${conn.connection.host}`);
        return conn;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        process.exit(1);
    }
};

// Clear all collections
const clearDatabase = async () => {
    try {
        const collections = mongoose.connection.collections;
        for (const key in collections) {
            await collections[key].deleteMany({});
        }
        console.log('🗑️  All collections cleared');
    } catch (error) {
        console.error('Error clearing database:', error);
    }
};

// Seed Users
const seedUsers = async () => {
    console.log('👤 Creating users...');
    
    const createdUsers = [];
    
    for (const userData of users) {
        // Hash password
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(userData.password, salt);
        
        const user = await User.create({
            ...userData,
            password: hashedPassword,
            isEmailVerified: true,
            isPhoneVerified: true
        });
        
        createdUsers.push(user);
        console.log(`  ✅ User: ${user.fullName} (${user.email}) - Role: ${user.role}`);
    }
    
    return createdUsers;
};

// Seed Categories
const seedCategories = async () => {
    console.log('\n📂 Creating categories...');
    
    const createdCategories = {};
    
    for (const catData of categories) {
        const category = await Category.create(catData);
        createdCategories[category.slug] = category;
        console.log(`  ✅ Category: ${category.name} (${category.nameHindi})`);
    }
    
    return createdCategories;
};

// Seed SubServices
const seedServices = async (categories) => {
    console.log('\n🔧 Creating services...');
    
    const createdServices = {};
    
    for (const [categorySlug, servicesList] of Object.entries(services)) {
        const category = categories[categorySlug];
        
        if (!category) {
            console.log(`  ⚠️  Category not found for: ${categorySlug}`);
            continue;
        }
        
        for (const serviceData of servicesList) {
            const service = await SubService.create({
                ...serviceData,
                category: category._id
            });
            
            createdServices[service.slug] = service;
            console.log(`  ✅ Service: ${service.name} (₹${service.basePrice})`);
        }
    }
    
    return createdServices;
};

// Seed Service Providers
const seedProviders = async (users, categories, servicesList) => {
    console.log('\n👨‍🔧 Creating service providers...');
    
    const createdProviders = [];
    
    for (const providerData of providers) {
        // Find the user for this provider
        const user = users.find(u => u.email === providerData.userEmail);
        
        if (!user) {
            console.log(`  ⚠️  User not found for provider: ${providerData.userEmail}`);
            continue;
        }
        
        // Update user role
        await User.findByIdAndUpdate(user._id, { role: 'provider' });
        
        // Map category slugs to actual category IDs
        const providerServices = providerData.services.map(s => {
            const category = categories[s.category];
            const subServices = s.subServices.map(ss => {
                const service = servicesList[ss];
                return service ? service._id : null;
            }).filter(Boolean);
            
            return {
                category: category ? category._id : null,
                subServices,
                customPrice: s.customPrice,
                isActive: s.isActive
            };
        }).filter(s => s.category && s.subServices.length > 0);
        
        const provider = await ServiceProvider.create({
            ...providerData.providerInfo,
            user: user._id,
            services: providerServices,
            verificationStatus: providerData.verificationStatus || 'verified',
            verifiedAt: new Date()
        });
        
        // Create wallet for provider
        await Wallet.create({
            user: user._id,
            balance: Math.floor(Math.random() * 5000),
            bankDetails: providerData.bankDetails
        });
        
        createdProviders.push(provider);
        console.log(`  ✅ Provider: ${provider.businessName} (${provider.services.length} services)`);
    }
    
    return createdProviders;
};

// Seed Coupons
const seedCoupons = async () => {
    console.log('\n🎫 Creating coupons...');
    
    for (const couponData of coupons) {
        await Coupon.create(couponData);
        console.log(`  ✅ Coupon: ${couponData.code} - ${couponData.discountValue}${couponData.discountType === 'percentage' ? '%' : '₹'} OFF`);
    }
};

// ✅ FIXED: Create sample bookings and reviews
const seedSampleBookings = async (customers, providers, servicesList) => {
    console.log('\n📋 Creating sample bookings...');
    
    if (customers.length === 0 || providers.length === 0) {
        console.log('  ⚠️  No customers or providers for sample bookings');
        return;
    }
    
    const statuses = ['completed', 'completed', 'completed', 'in_progress', 'confirmed', 'pending'];
    
    for (let i = 0; i < 6; i++) {
        const customer = customers[i % customers.length];
        const provider = providers[i % providers.length];
        
        // Get a random service from provider
        const providerService = provider.services[0];
        if (!providerService || !providerService.subServices[0]) continue;
        
        const service = await SubService.findById(providerService.subServices[0]);
        if (!service) continue;
        
        // ✅ GENERATE BOOKING ID MANUALLY
        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
        const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
        const bookingId = `BK${dateStr}${randomStr}`;
        
        // ✅ BUILD BOOKING DATA WITH BOOKING ID
        const bookingData = {
            bookingId: bookingId,
            customer: customer._id,
            provider: provider._id,
            category: providerService.category,
            items: [{
                service: service._id,
                serviceName: service.name,
                quantity: 1,
                unitPrice: service.basePrice,
                totalPrice: service.basePrice
            }],
            scheduledDate: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000),
            scheduledTime: {
                start: '10:00',
                end: '12:00'
            },
            serviceAddress: customer.addresses[0] || {
                street: '123 Main St',
                city: 'Mumbai',
                state: 'Maharashtra',
                pincode: '400001'
            },
            status: statuses[i],
            pricing: {
                subtotal: service.basePrice,
                discount: { code: null, amount: 0 },
                taxes: {
                    gst: Math.round(service.basePrice * 0.09 * 100) / 100,
                    sgst: Math.round(service.basePrice * 0.09 * 100) / 100,
                    cgst: 0
                },
                convenienceFee: Math.round(service.basePrice * 0.05 * 100) / 100,
                total: Math.round(service.basePrice * 1.23 * 100) / 100
            },
            payment: {
                method: 'online',
                status: i < 3 ? 'paid' : 'pending',
                paidAt: i < 3 ? new Date() : null,
                paidAmount: i < 3 ? Math.round(service.basePrice * 1.23 * 100) / 100 : null
            }
        };
        
        // ✅ USE createBooking METHOD
        const booking = await Booking.createBooking(bookingData);
        
        console.log(`  ✅ Booking: ${booking.bookingId} - ${statuses[i]}`);
        
        // Create review for completed bookings
        if (statuses[i] === 'completed') {
            await Review.create({
                booking: booking._id,
                customer: customer._id,
                provider: provider._id,
                service: service._id,
                rating: {
                    overall: Math.floor(Math.random() * 2) + 4,
                    punctuality: Math.floor(Math.random() * 3) + 3,
                    quality: Math.floor(Math.random() * 2) + 4,
                    behaviour: Math.floor(Math.random() * 2) + 4,
                    valueForMoney: Math.floor(Math.random() * 3) + 3
                },
                title: 'Great service!',
                comment: 'Very professional and timely service. Highly recommended!',
                status: 'approved'
            });
            
            // Update booking
            await Booking.findByIdAndUpdate(booking._id, { hasReviewed: true });
            
            console.log('    └─ Review added');
        }
    }
};

// Main seed function
const seedDatabase = async () => {
    const startTime = Date.now();
    
    try {
        // Connect to database
        await connectDB();
        
        // Ask for confirmation in production
        if (process.env.NODE_ENV === 'production') {
            console.log('⚠️  WARNING: You are about to seed the PRODUCTION database!');
            console.log('This will DELETE all existing data.');
            console.log('Press Ctrl+C to cancel or wait 5 seconds to continue...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        
        // Clear existing data
        console.log('\n🧹 Clearing old data...');
        await clearDatabase();
        
        // Seed in order
        const createdUsers = await seedUsers();
        const createdCategories = await seedCategories();
        const createdServices = await seedServices(createdCategories);
        const createdProviders = await seedProviders(createdUsers, createdCategories, createdServices);
        await seedCoupons();
        
        // Create sample bookings
        const customers = createdUsers.filter(u => u.role === 'customer');
        await seedSampleBookings(customers, createdProviders, createdServices);
        
        // Calculate total time
        const endTime = Date.now();
        const totalTime = (endTime - startTime) / 1000;
        
        // Summary
        console.log('\n' + '='.repeat(50));
        console.log('🎉 DATABASE SEEDED SUCCESSFULLY!');
        console.log('='.repeat(50));
        console.log(`⏱️  Time taken: ${totalTime.toFixed(2)} seconds`);
        console.log(`👤 Users: ${createdUsers.length}`);
        console.log(`📂 Categories: ${Object.keys(createdCategories).length}`);
        console.log(`🔧 Services: ${Object.keys(createdServices).length}`);
        console.log(`👨‍🔧 Providers: ${createdProviders.length}`);
        
        console.log('\n📧 Login Credentials:');
        console.log('─'.repeat(40));
        console.log('Admin:');
        console.log('  Email: admin@gharseva.com');
        console.log('  Password: admin123456');
        console.log('\nTest Customer:');
        console.log('  Email: rahul@example.com');
        console.log('  Password: Rahul@123');
        console.log('\nTest Provider:');
        console.log('  Email: amit@example.com');
        console.log('  Password: Amit@1234');
        
        console.log('\n🚀 Server is ready to start!');
        console.log('  Run: npm start');
        console.log('  API: http://localhost:5000/api/v1');
        console.log('='.repeat(50));
        
    } catch (error) {
        console.error('\n❌ Seeding failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        // Close database connection
        await mongoose.connection.close();
        console.log('\n👋 Database connection closed');
    }
};

// Run seeder
seedDatabase();