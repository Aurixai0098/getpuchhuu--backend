const coupons = [
    {
        code: 'WELCOME50',
        description: 'Get 50% off on your first booking',
        discountType: 'percentage',
        discountValue: 50,
        minOrderAmount: 199,
        maxDiscount: 200,
        applicableFor: {
            userType: 'new'
        },
        usageLimit: {
            perUser: 1,
            total: 500
        },
        validFrom: new Date('2024-01-01'),
        validUntil: new Date('2025-12-31'),
        isActive: true
    },
    {
        code: 'FLAT100',
        description: 'Flat ₹100 off on all services',
        discountType: 'fixed',
        discountValue: 100,
        minOrderAmount: 299,
        maxDiscount: 100,
        applicableFor: {
            userType: 'all'
        },
        usageLimit: {
            perUser: 2,
            total: 1000
        },
        validFrom: new Date('2024-01-01'),
        validUntil: new Date('2025-06-30'),
        isActive: true
    },
    {
        code: 'SAVE20',
        description: '20% off on electrical services',
        discountType: 'percentage',
        discountValue: 20,
        minOrderAmount: 149,
        maxDiscount: 150,
        applicableFor: {
            categories: [], // Will be filled during seeding
            userType: 'all'
        },
        usageLimit: {
            perUser: 1,
            total: 200
        },
        validFrom: new Date('2024-01-01'),
        validUntil: new Date('2025-03-31'),
        isActive: true
    },
    {
        code: 'DIWALI2024',
        description: 'Festival special - ₹200 off',
        discountType: 'fixed',
        discountValue: 200,
        minOrderAmount: 999,
        maxDiscount: 200,
        applicableFor: {
            userType: 'all'
        },
        usageLimit: {
            perUser: 1,
            total: 100
        },
        validFrom: new Date('2024-10-01'),
        validUntil: new Date('2024-12-31'),
        isActive: true
    }
];

module.exports = { coupons };