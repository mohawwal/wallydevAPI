module.exports = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.message = err.message || 'Internal Server Error';

    console.error('Error occurred:', {
        message: err.message,
        statusCode: err.statusCode,
        stack: err.stack,
        path: req.path,
        method: req.method
    });

    if (process.env.NODE_ENV === 'development') {
        return res.status(err.statusCode).json({
            success: false,
            error: err,
            message: err.message,
            stack: err.stack,
        });
    }

    if (process.env.NODE_ENV === 'production') {
        let error = { ...err };
        error.message = err.message;

        // Handle specific PostgreSQL errors
        if (err.code === '23505') {
            error.message = 'Duplicate field value entered';
            error.statusCode = 400;
        }

        if (err.code === '23503') {
            error.message = 'Foreign key constraint violation';
            error.statusCode = 400;
        }

        if (err.name === 'JsonWebTokenError') {
            error.message = 'Invalid token';
            error.statusCode = 401;
        }

        if (err.name === 'TokenExpiredError') {
            error.message = 'Token expired';
            error.statusCode = 401;
        }

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