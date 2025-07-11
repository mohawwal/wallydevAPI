const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();
const pool = require("../model/db");
const ErrorHandler = require("../utils/errorHandler");
const catchAsyncErrors = require("../middlewares/catchAsyncErrors");
const sendToken = require("../utils/jwtToken");
const { isAuthenticatedAdmin, isAuthenticatedUser } = require("../middlewares/auth");

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

    // Check if this is the first user in the database
    const countResult = await pool.query('SELECT COUNT(*) FROM users');
    const isFirstUser = parseInt(countResult.rows[0].count, 10) === 0;

    const role = isFirstUser ? 'admin' : 'guest';

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
            console.log('User not found:', email);
            return next(new ErrorHandler("Invalid email or password", 401));
        }

        const user = userQuery.rows[0];
        console.log('User found:', user.email, 'Role:', user.role);

        // Compare passwords
        const isPasswordMatch = await bcrypt.compare(password, user.password);
        
        if (!isPasswordMatch) {
            console.log('Password mismatch for user:', email);
            return next(new ErrorHandler("Invalid email or password", 401));
        }

        console.log('Login successful for:', user.email);
        sendToken(user, 200, res);
    }),
);

router.put(
    "/auth/change-password",
    isAuthenticatedAdmin,
    catchAsyncErrors(async (req, res, next) => {
        const { currentPassword, newPassword, confirmNewPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmNewPassword) {
            return next(new ErrorHandler("Current password, new password, and confirm new password are required", 400));
        }

        if (newPassword !== confirmNewPassword) {
            return next(new ErrorHandler("New passwords do not match", 400));
        }

        if (newPassword.length < 6) {
            return next(new ErrorHandler("New password must be at least 6 characters long", 400));
        }

        if (currentPassword === newPassword) {
            return next(new ErrorHandler("New password must be different from current password", 400));
        }

        // Get current user from database
        const userQuery = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
        
        if (userQuery.rows.length === 0) {
            return next(new ErrorHandler("User not found", 404));
        }

        const user = userQuery.rows[0];

        // Verify current password
        const isCurrentPasswordMatch = await bcrypt.compare(currentPassword, user.password);
        
        if (!isCurrentPasswordMatch) {
            return next(new ErrorHandler("Current password is incorrect", 401));
        }

        // Hash new password
        const saltRounds = 12;
        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

        // Update password in database
        const updateQuery = `
            UPDATE users 
            SET password = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2 
            RETURNING id, email, role, created_at
        `;

        const updatedUserResult = await pool.query(updateQuery, [hashedNewPassword, req.user.id]);
        const updatedUser = updatedUserResult.rows[0];

        res.status(200).json({
            success: true,
            message: "Password changed successfully",
            user: {
                id: updatedUser.id,
                email: updatedUser.email,
                role: updatedUser.role,
                created_at: updatedUser.created_at
            }
        });
    }),
);

router.get(
    "/auth/me",
    isAuthenticatedUser,
    catchAsyncErrors(async (req, res, next) => {
        console.log('Getting user info for:', req.user.email);
        
        res.status(200).json({
            success: true,
            user: {
                id: req.user.id,
                email: req.user.email,
                role: req.user.role,
                created_at: req.user.created_at
            }
        });
    })
);

router.get(
    "/get-all-users",
    isAuthenticatedAdmin,
    catchAsyncErrors(async (req, res, next) => {
        const usersQuery = await pool.query('SELECT id, email, role, created_at FROM users ORDER BY created_at DESC');
        res.status(200).json({
            success: true,
            users: usersQuery.rows,
            count: usersQuery.rows.length
        });
    }),
);

router.post(
    "/auth/logout",
    catchAsyncErrors(async (req, res, next) => {
        console.log('Logout request received');
        
        res.cookie('token', '', {
            expires: new Date(0),
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            path: '/'
        });

        res.status(200).json({
            success: true,
            message: "Logged out successfully"
        });
    }),
);

module.exports = router;