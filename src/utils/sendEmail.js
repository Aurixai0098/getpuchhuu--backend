const transporter = require('../config/email');

const sendEmail = async ({ email, subject, html }) => {
    if (!transporter) {
        throw new Error('Email service not configured. Please set EMAIL_USER and EMAIL_PASS in .env');
    }

    try {
        const mailOptions = {
            from: `"${process.env.FROM_NAME || 'GharSeva'}" <${process.env.FROM_EMAIL || process.env.EMAIL_USER}>`,
            to: email,
            subject,
            html,
        };
        await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent to ${email}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to send email to ${email}:`, error.message);
        throw new Error(`Email sending failed: ${error.message}`);
    }
};

// Email Templates – OTP clearly visible
const emailTemplates = {
    registrationOTP: (otp, name) => `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>Verify Your Email</title></head>
        <body style="font-family: Arial, sans-serif; background:#f4f4f4; padding:20px;">
            <div style="max-width:500px; margin:auto; background:white; padding:30px; border-radius:10px;">
                <h2>Welcome ${name || 'Guest'}!</h2>
                <p>Use the OTP below to complete your registration:</p>
                <div style="font-size:42px; font-weight:bold; letter-spacing:5px; background:#eef2ff; display:inline-block; padding:10px 20px; border-radius:8px;">
                    ${otp}
                </div>
                <p style="margin-top:20px;">This OTP is valid for ${process.env.OTP_EXPIRE_MINUTES || 10} minutes.</p>
                <p>If you didn't request this, please ignore this email.</p>
            </div>
        </body>
        </html>
    `,
    
    loginOTP: (otp, name) => `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>Login OTP</title></head>
        <body style="font-family: Arial, sans-serif; background:#f4f4f4; padding:20px;">
            <div style="max-width:500px; margin:auto; background:white; padding:30px; border-radius:10px;">
                <h2>Hello ${name || 'User'}!</h2>
                <p>Your login OTP is:</p>
                <div style="font-size:42px; font-weight:bold; letter-spacing:5px; background:#eef2ff; display:inline-block; padding:10px 20px; border-radius:8px;">
                    ${otp}
                </div>
                <p style="margin-top:20px;">This OTP is valid for ${process.env.OTP_EXPIRE_MINUTES || 10} minutes.</p>
                <p>If you didn't request this, please secure your account.</p>
            </div>
        </body>
        </html>
    `,
    
    bookingConfirmation: (booking) => `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>Booking Confirmed</title></head>
        <body style="font-family: Arial, sans-serif; background:#f4f4f4; padding:20px;">
            <div style="max-width:500px; margin:auto; background:white; padding:30px; border-radius:10px;">
                <h2>Booking Confirmed!</h2>
                <p><strong>Booking ID:</strong> ${booking.bookingId}</p>
                <p><strong>Date:</strong> ${new Date(booking.scheduledDate).toLocaleDateString()}</p>
                <p><strong>Total:</strong> ₹${booking.pricing?.total}</p>
            </div>
        </body>
        </html>
    `
};

module.exports = { sendEmail, emailTemplates };