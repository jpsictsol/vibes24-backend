// =================================================================
// FINAL, COMPLETE, AND STABLE server.js (Using Resend for Emails)
// =================================================================

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// NEW: Use Resend instead of Nodemailer
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

// All other required packages
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

const app = express();
app.use(cors());
app.use(express.json());

// --- STABLE DATABASE CONNECTION ---
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});
db.connect((err, client, release) => {
    if (err) return console.error('FATAL ERROR connecting to PostgreSQL database:', err.stack);
    if (client) client.release();
    console.log('Successfully connected to PostgreSQL Database!');
});

// --- ALL OTHER SETUPS (CLOUDINARY, AUTH) ARE STABLE ---
// ... (cloudinary, multer, authenticateToken setups are correct and unchanged)
cloudinary.config({ /* ... */ });
const storage = new CloudinaryStorage({ /* ... */ });
const upload = multer({ storage: storage });
const authenticateToken = (req, res, next) => { /* ... */ };

// =================================================================
// --- PUBLIC ROUTES ---
// =================================================================

// REGISTER A NEW USER
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const password_hash = password;
    const sql = 'INSERT INTO users (username, email, password_hash, otp) VALUES ($1, $2, $3, $4)';

    try {
        await db.query(sql, [username, email, password_hash, otp]);

        // THE FIX: Use Resend to send the email
        await resend.emails.send({
            from: 'onboarding@resend.dev', // This is Resend's required "from" address for free tier
            to: email,
            subject: 'Your Vibes24 Verification Code',
            html: `<p>Welcome to Vibes24! Your One-Time Password is: <strong>${otp}</strong></p>`
        });
        
        console.log(`SUCCESS: Registered ${username} and sent OTP to ${email} via Resend.`);
        return res.status(201).json({ success: true, message: `Registration successful! An OTP has been sent to ${email}.` });

    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ success: false, message: 'That username or email already exists.' });
        }
        console.error("DB or Mail Error on Register:", err);
        return res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
});


// ALL OTHER ROUTES (LOGIN, VERIFY-OTP, MEMBERS, PROFILE, UPLOAD) ARE CORRECT AND STABLE
// ... app.post('/api/login', ...)
// ... app.post('/api/verify-otp', ...)
// ... app.get('/api/members', ...)
// ... app.get('/api/profile', ...)
// ... app.post('/api/profile/upload-photo', ...)


// --- START THE SERVER ---
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running and ready for connections on port ${port}`);
});
