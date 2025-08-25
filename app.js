const express = require('express');
const app = express();
const cors = require('cors');
const cookieParser = require("cookie-parser");
const cloudinary = require('cloudinary').v2;
const errorHandler = require('./middlewares/errors');


const allowedOrigins = [
    'https://wally-dev-admin.vercel.app',
    'https://awwal-dev.vercel.app',
    'http://localhost:3000'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        } else {
            // console.log('CORS blocked origin:', origin);
            return callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    optionsSuccessStatus: 200
}));


cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.json({ 
        message: 'Wally dev API is running!',
    });
});


// Routes
const authRouter = require('./routes/Auth');
app.use('/api/v1', authRouter);

const frontendRouter = require('./routes/Frontend')
app.use('/api/v1', frontendRouter)

const mobileAppRouter = require('./routes/MobileApp')
app.use('/api/v1', mobileAppRouter)

const backendRouter = require('./routes/Backend')
app.use('/api/v1', backendRouter)


app.use(errorHandler);

module.exports = app;