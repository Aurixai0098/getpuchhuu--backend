const { validationResult } = require('express-validator');

const validate = (validations) => {
    return async (req, res, next) => {
        // Run all validations
        await Promise.all(validations.map(validation => validation.run(req)));

        const errors = validationResult(req);
        
        if (errors.isEmpty()) {
            return next();
        }

        // Extract validation errors
        const extractedErrors = errors.array().map(err => ({
            field: err.path || err.param,
            message: err.msg,
            value: err.value
        }));

        // Return proper error response
        return res.status(422).json({
            success: false,
            message: 'Validation Error',
            errors: extractedErrors
        });
    };
};

module.exports = validate;