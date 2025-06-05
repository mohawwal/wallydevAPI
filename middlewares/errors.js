const ErrorHandler = require('../utils/errorHandler');

module.exports = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;

    if (process.env.NODE_ENV === 'development') {
        return res.status(err.statusCode).json({
            success: false,
            error: err,
            errMessage: err.message,
            stack: err.stack,
        });
    }

    if (process.env.NODE_ENV === 'production') {
        let error = { ...err };
        error.message = err.message;


        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Internal Server Error',
        });
    }

    
    return res.status(err.statusCode).json({
        success: false,
        message: err.message || 'Something went wrong',
    });
};