const users = [
    // Admin user
    {
        firstName: 'Admin',
        lastName: 'GharSeva',
        email: 'admin@gharseva.com',
        phone: '9999900001',
        password: 'admin123456',
        role: 'admin',
        status: 'active',
        gender: 'male',
        addresses: [],
        notificationPreferences: {
            email: true,
            sms: true,
            push: true
        }
    },
    
    // Customer users
    {
        firstName: 'Rahul',
        lastName: 'Sharma',
        email: 'rahul@example.com',
        phone: '9876543211',
        password: 'Rahul@123',
        role: 'customer',
        status: 'active',
        gender: 'male',
        addresses: [
            {
                type: 'home',
                street: '42, Sunshine Apartments, MG Road',
                landmark: 'Near Central Mall',
                city: 'Mumbai',
                state: 'Maharashtra',
                pincode: '400001',
                coordinates: { latitude: 19.0760, longitude: 72.8777 },
                isDefault: true
            },
            {
                type: 'work',
                street: '101, Tech Park, BKC',
                landmark: 'Near Jio World Centre',
                city: 'Mumbai',
                state: 'Maharashtra',
                pincode: '400051',
                coordinates: { latitude: 19.0692, longitude: 72.8528 },
                isDefault: false
            }
        ]
    },
    {
        firstName: 'Priya',
        lastName: 'Patel',
        email: 'priya@example.com',
        phone: '9876543212',
        password: 'Priya@123',
        role: 'customer',
        status: 'active',
        gender: 'female',
        addresses: [
            {
                type: 'home',
                street: '15, Kala Niketan, SV Road',
                landmark: 'Near station',
                city: 'Mumbai',
                state: 'Maharashtra',
                pincode: '400002',
                coordinates: { latitude: 19.0810, longitude: 72.8410 },
                isDefault: true
            }
        ]
    },
    
    // Provider users
    {
        firstName: 'Amit',
        lastName: 'Kumar',
        email: 'amit@example.com',
        phone: '8765432101',
        password: 'Amit@1234',
        role: 'customer', // Will be changed to provider during seeding
        status: 'active',
        gender: 'male',
        addresses: [
            {
                type: 'home',
                street: 'Shop 5, Patel Nagar',
                landmark: 'Near bus stop',
                city: 'Mumbai',
                state: 'Maharashtra',
                pincode: '400001',
                coordinates: { latitude: 19.0780, longitude: 72.8750 },
                isDefault: true
            }
        ]
    },
    {
        firstName: 'Sunil',
        lastName: 'Yadav',
        email: 'sunil@example.com',
        phone: '8765432102',
        password: 'Sunil@1234',
        role: 'customer',
        status: 'active',
        gender: 'male',
        addresses: []
    },
    {
        firstName: 'Ramesh',
        lastName: 'Gupta',
        email: 'ramesh@example.com',
        phone: '8765432103',
        password: 'Ramesh@1234',
        role: 'customer',
        status: 'active',
        gender: 'male',
        addresses: []
    }
];

const providers = [
    {
        userEmail: 'amit@example.com',
        verificationStatus: 'verified',
        providerInfo: {
            businessName: 'Amit Plumbing Solutions',
            bio: 'Expert plumber with 10+ years of experience. Specialized in all types of plumbing repairs and installations.',
            experience: {
                years: 10,
                description: 'Worked with multiple residential and commercial clients across Mumbai'
            },
            serviceArea: {
                type: 'Point',
                coordinates: [72.8750, 19.0780],
                radius: 15,
                pincodes: ['400001', '400002', '400003', '400050'],
                cities: ['Mumbai']
            },
            workingHours: [
                { day: 'monday', isWorking: true, slots: [{ startTime: '09:00', endTime: '18:00' }] },
                { day: 'tuesday', isWorking: true, slots: [{ startTime: '09:00', endTime: '18:00' }] },
                { day: 'wednesday', isWorking: true, slots: [{ startTime: '09:00', endTime: '18:00' }] },
                { day: 'thursday', isWorking: true, slots: [{ startTime: '09:00', endTime: '18:00' }] },
                { day: 'friday', isWorking: true, slots: [{ startTime: '09:00', endTime: '18:00' }] },
                { day: 'saturday', isWorking: true, slots: [{ startTime: '09:00', endTime: '14:00' }] },
                { day: 'sunday', isWorking: false, slots: [] }
            ],
            isAvailable: true,
            isFeatured: true,
            commissionRate: 20
        },
        services: [
            {
                category: 'plumbing',
                subServices: ['tap-repair', 'pipe-repair', 'toilet-installation'],
                customPrice: 249,
                isActive: true
            }
        ],
        bankDetails: {
            accountHolderName: 'Amit Kumar',
            accountNumber: '123456789012',
            ifscCode: 'HDFC0001234',
            bankName: 'HDFC Bank',
            branchName: 'Mumbai Main Branch',
            isVerified: true
        }
    },
    {
        userEmail: 'sunil@example.com',
        verificationStatus: 'verified',
        providerInfo: {
            businessName: 'Sunil Electrical Services',
            bio: 'Licensed electrician with 8 years of experience. Expert in all electrical work.',
            experience: { years: 8, description: 'Residential and commercial electrical work' },
            serviceArea: {
                type: 'Point',
                coordinates: [72.8410, 19.0810],
                radius: 10,
                pincodes: ['400002', '400003'],
                cities: ['Mumbai']
            },
            workingHours: [
                { day: 'monday', isWorking: true, slots: [{ startTime: '08:00', endTime: '20:00' }] },
                { day: 'tuesday', isWorking: true, slots: [{ startTime: '08:00', endTime: '20:00' }] },
                { day: 'wednesday', isWorking: true, slots: [{ startTime: '08:00', endTime: '20:00' }] },
                { day: 'thursday', isWorking: true, slots: [{ startTime: '08:00', endTime: '20:00' }] },
                { day: 'friday', isWorking: true, slots: [{ startTime: '08:00', endTime: '20:00' }] },
                { day: 'saturday', isWorking: true, slots: [{ startTime: '08:00', endTime: '18:00' }] },
                { day: 'sunday', isWorking: false, slots: [] }
            ],
            isAvailable: true,
            isFeatured: false,
            commissionRate: 18
        },
        services: [
            {
                category: 'electrical',
                subServices: ['switch-board-repair', 'fan-installation', 'mcb-installation'],
                customPrice: 199,
                isActive: true
            }
        ],
        bankDetails: {
            accountHolderName: 'Sunil Yadav',
            accountNumber: '987654321098',
            ifscCode: 'SBIN0005678',
            bankName: 'State Bank of India',
            branchName: 'Mumbai Central',
            isVerified: true
        }
    },
    {
        userEmail: 'ramesh@example.com',
        verificationStatus: 'verified',
        providerInfo: {
            businessName: 'Cool Breeze AC Services',
            bio: 'AC repair specialist. All brands covered. Fast and reliable service.',
            experience: { years: 6, description: 'AC repair, service, and installation expert' },
            serviceArea: {
                type: 'Point',
                coordinates: [72.8528, 19.0692],
                radius: 12,
                pincodes: ['400050', '400051'],
                cities: ['Mumbai']
            },
            workingHours: [
                { day: 'monday', isWorking: true, slots: [{ startTime: '10:00', endTime: '19:00' }] },
                { day: 'tuesday', isWorking: true, slots: [{ startTime: '10:00', endTime: '19:00' }] },
                { day: 'wednesday', isWorking: true, slots: [{ startTime: '10:00', endTime: '19:00' }] },
                { day: 'thursday', isWorking: true, slots: [{ startTime: '10:00', endTime: '19:00' }] },
                { day: 'friday', isWorking: true, slots: [{ startTime: '10:00', endTime: '19:00' }] },
                { day: 'saturday', isWorking: true, slots: [{ startTime: '10:00', endTime: '16:00' }] },
                { day: 'sunday', isWorking: false, slots: [] }
            ],
            isAvailable: true,
            isFeatured: false,
            commissionRate: 22
        },
        services: [
            {
                category: 'ac-repair',
                subServices: ['ac-service', 'ac-gas-refill'],
                customPrice: 449,
                isActive: true
            }
        ],
        bankDetails: {
            accountHolderName: 'Ramesh Gupta',
            accountNumber: '456789123456',
            ifscCode: 'ICIC0007890',
            bankName: 'ICICI Bank',
            branchName: 'BKC Branch',
            isVerified: true
        }
    }
];

module.exports = { users, providers };