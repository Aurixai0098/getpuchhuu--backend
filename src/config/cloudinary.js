
 // src/config/cloudinary.js

const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { Readable } = require('stream');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
) {
    console.error('❌ Cloudinary credentials missing!');
}

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/gif'
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed'), false);
    }
};

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter
});

const uploadToCloudinary = (buffer, folder = 'gharseva/avatars') => {
    return new Promise((resolve, reject) => {
        if (!Buffer.isBuffer(buffer)) {
            return reject(new Error('Invalid image buffer'));
        }

        const uploadOptions = {
            folder,
            resource_type: 'image',
            transformation: [
                { width: 500, height: 500, crop: 'limit' },
                { quality: 'auto' }
            ]
        };

        const uploadStream = cloudinary.uploader.upload_stream(
            uploadOptions,
            (error, result) => {
                if (error) {
                    return reject(error);
                }

                if (!result || !result.secure_url) {
                    return reject(new Error('Cloudinary upload failed'));
                }

                resolve(result);
            }
        );

        Readable.from(buffer).pipe(uploadStream);

        uploadStream.on('error', reject);
    });
};

module.exports = {
    cloudinary,
    upload,
    uploadToCloudinary
};
