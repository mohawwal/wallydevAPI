const jwt = require('jsonwebtoken')
const pool = require("../model/db")
const catchAsyncErrors = require("./catchAsyncErrors");
const ErrorHandler = require("../utils/errorHandler")


exports.isAuthenticatedUser = catchAsyncErrors(async(req, res, next) => {
    const { token } = req.cookies;

    //console.log('Auth middleware - Token from cookies:', token ? 'Present' : 'Missing');
    //console.log('All cookies:', req.cookies);

    if(!token) {
        return next(new ErrorHandler('Please login to access this resources', 401))
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const userQuery = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id])

    if(userQuery.rows.length === 0) {
        return next(new ErrorHandler('User not found', 404))
    }

    req.user = userQuery.rows[0];
    next()
})


exports.isAdmin = catchAsyncErrors(async(req, res, next) => {
    if(!req.user) {
        return next(new ErrorHandler('Please login first', 401))
    }

    if(req.user.role !== 'admin') {
        return next(new ErrorHandler('Access denied. Admin privileges required', 403))
    }

    next()
})

exports.isAuthenticatedAdmin = [
    exports.isAuthenticatedUser,
    exports.isAdmin
]