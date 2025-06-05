const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();
const pool = require("../model/db");
const ErrorHandler = require("../utils/errorHandler");
const catchAsyncErrors = require("../middlewares/catchAsyncErrors");
const sendToken = require("../utils/jwtToken");

router.post(
  "/auth/signup",
  catchAsyncErrors(async (req, res, next) => {
    const { email, password, confirmPassword } = req.body;

    if (!email || !password || !confirmPassword) {
      return next(new ErrorHandler("Email, Password and Confirm Password are required", 400));
    }

    if (password !== confirmPassword) {
      return next(new ErrorHandler("Passwords do not match", 400));
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return next(new ErrorHandler("Please provide a valid email address", 400));
    }

    if (password.length < 6) {
      return next(new ErrorHandler("Password must be at least 6 characters long", 400));
    }

    const existingUserQuery = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existingUserQuery.rows.length > 0) {
      return next(new ErrorHandler("User already exists with this email", 400));
    }

    // ✅ Check if this is the first user in the database
    const countResult = await pool.query('SELECT COUNT(*) FROM users');
    const isFirstUser = parseInt(countResult.rows[0].count, 10) === 0;

    const role = isFirstUser ? 'admin' : 'guest'; // ✅ Assign admin if first user

    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const createUserQuery = `
      INSERT INTO users (email, password, role) 
      VALUES ($1, $2, $3) 
      RETURNING id, email, role, created_at
    `;

    const newUserResult = await pool.query(createUserQuery, [email.toLowerCase(), hashedPassword, role]);
    const newUser = newUserResult.rows[0];

    sendToken(newUser, 201, res);
  }),
);


router.post(
    "/auth/login",
    catchAsyncErrors(async (req, res, next) => {
        const { email, password } = req.body;

        if (!email || !password) {
            return next(new ErrorHandler("Please provide email and password", 400));
        }

        // Find user by email
        const userQuery = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
        
        if (userQuery.rows.length === 0) {
            return next(new ErrorHandler("Invalid email or password", 401));
        }

        const user = userQuery.rows[0];

        // Compare passwords
        const isPasswordMatch = await bcrypt.compare(password, user.password);
        
        if (!isPasswordMatch) {
            return next(new ErrorHandler("Invalid email or password", 401));
        }

        sendToken(user, 200, res);
    }),
);

router.get(
    "/get-all-users",
    catchAsyncErrors(async (req, res, next) => {
        const usersQuery = await pool.query('SELECT id, email, role, created_at FROM users');
        res.status(200).json({
            success: true,
            users: usersQuery.rows
        });
    }),
);

router.post(
    "/auth/logout",
    catchAsyncErrors(async (req, res, next) => {
        res.cookie('token', null, {
            expires: new Date(Date.now()),
            httpOnly: true
        });

        res.status(200).json({
            success: true,
            message: "Logged out successfully"
        });
    }),
);

module.exports = router;