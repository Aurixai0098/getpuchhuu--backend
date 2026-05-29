const OTP = require('../models/OTP');

class OTPManager {
    constructor() {
        this.OTP_EXPIRE_MINUTES = parseInt(process.env.OTP_EXPIRE_MINUTES) || 10;
        this.MAX_OTP_PER_DAY = parseInt(process.env.MAX_OTP_REQUESTS_PER_DAY) || 5;
    }

    generateOTP() {
        // Generate 6-digit OTP
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    async storeOTP(email, otp, type = 'registration') {
        try {
            // Check daily limit
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const dailyCount = await OTP.countDocuments({
                email,
                type,
                createdAt: { $gte: today, $lt: tomorrow }
            });

            if (dailyCount >= this.MAX_OTP_PER_DAY) {
                throw new Error(`Maximum OTP limit (${this.MAX_OTP_PER_DAY}) reached for today`);
            }

            // Delete old OTPs for this email and type
            await OTP.deleteMany({ email, type });

            // Calculate expiry date properly
            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + this.OTP_EXPIRE_MINUTES);

            // Store new OTP
            const otpRecord = await OTP.create({
                email,
                otp,
                type,
                expiresAt: expiresAt,
                attempts: 0,
                isUsed: false
            });

            console.log(`✅ OTP stored for ${email}: ${otp} (expires at ${expiresAt})`);
            return true;
        } catch (error) {
            console.error('Error storing OTP:', error);
            throw error;
        }
    }

    async verifyOTP(email, otp, type = 'registration') {
        try {
            const otpRecord = await OTP.findOne({
                email,
                type,
                isUsed: false,
                expiresAt: { $gt: new Date() }
            });

            if (!otpRecord) {
                throw new Error('OTP has expired. Please request a new one.');
            }

            if (otpRecord.attempts >= 3) {
                await OTP.deleteOne({ _id: otpRecord._id });
                throw new Error('Maximum attempts exceeded. Please request a new OTP.');
            }

            if (otpRecord.otp !== otp) {
                otpRecord.attempts += 1;
                await otpRecord.save();
                throw new Error(`Invalid OTP. ${3 - otpRecord.attempts} attempts remaining.`);
            }

            // Mark as used
            otpRecord.isUsed = true;
            await otpRecord.save();

            console.log(`✅ OTP verified for ${email}`);
            return true;
        } catch (error) {
            console.error('Error verifying OTP:', error);
            throw error;
        }
    }

    async getRemainingOTPCount(email) {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const count = await OTP.countDocuments({
                email,
                createdAt: { $gte: today, $lt: tomorrow }
            });

            return this.MAX_OTP_PER_DAY - count;
        } catch (error) {
            console.error('Error getting OTP count:', error);
            return this.MAX_OTP_PER_DAY;
        }
    }
}

module.exports = new OTPManager();