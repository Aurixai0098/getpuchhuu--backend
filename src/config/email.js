const nodemailer = require('nodemailer');

let transporter = null;

const initTransporter = () => {
   
    // Environment variables with fallback (for testing only)
    const user = process.env.EMAIL_USER || "raorahul5631@gmail.com";
    const pass = process.env.EMAIL_PASS || "wgezhmejlqidutwt";   // spaces removed
    const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.EMAIL_PORT) || 587;

    if (!user || !pass) {
        console.error('❌ EMAIL_USER or EMAIL_PASS missing');
        return null;
    }

    const config = {
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        tls: { rejectUnauthorized: false }  // dev only
    };

    const transport = nodemailer.createTransport(config);

    // Verify connection – but never set transporter to null on failure
    transport.verify((err, success) => {
        if (err) {
            console.error('⚠️ SMTP verification failed:', err.message);
            console.error('   Emails may still send, check your network/credentials.');
        } else {
            console.log('✅ SMTP ready to send emails');
        }
    });

    return transport;
};

transporter = initTransporter();

module.exports = transporter;