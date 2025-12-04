// =================================================================
// FINAL, COMPLETE, AND STABLE server.js (Correctly Structured)
// =================================================================

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// All other required packages
const nodemailer = require('nodemailer');
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

// --- STABLE EMAIL TRANSPORTER (THE "MAILMAN") ---
// We create the transporter only ONCE when the server starts. This is the fix.
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_EMAIL,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

// --- ALL OTHER SETUPS (CLOUDINARY, AUTH) ARE STABLE ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'vibes24_profiles',
        format: 'jpg',
        public_id: (req, file) => {
            if (req.user && req.user.id) return `user-${req.user.id}-${Date.now()}`;
            return `unknown-user-${Date.now()}`;
        }
    },
});
const upload = multer({ storage: storage });
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.status(401).json({ success: false, message: "Token required." });
    jwt.verify(token, 'your_super_secret_key_12345', (err, payload) => {
        if (err) return res.status(403).json({ success: false, message: "Token is invalid or has expired." });
        if (!payload || !payload.user || !payload.user.id) return res.status(403).json({ success: false, message: "Token is malformed." });
        req.user = payload.user;
        next();
    });
};

// =================================================================
// --- PUBLIC ROUTES ---
// =================================================================

// REGISTER A NEW USER
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ success: false, message: 'All fields are required.' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const password_hash = password;
    const sql = 'INSERT INTO users (username, email, password_hash, otp) VALUES ($1, $2, $3, $4)';

    try {
        await db.query(sql, [username, email, password_hash, otp]);

        const mailOptions = {
            from: `"Vibes24" <${process.env.GMAIL_EMAIL}>`,
            to: email,
            subject: 'Your Vibes24 Verification Code',
            text: `Welcome to Vibes24! Your One-Time Password is: ${otp}`
        };

        // We now use the single, stable transporter created above.
        await transporter.sendMail(mailOptions);
        
        console.log(`SUCCESS: Registered ${username} and sent OTP to ${email}`);
        return res.status(201).json({ success: true, message: `Registration successful! An OTP has been sent to ${email}.` });

    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ success: false, message: 'That username or email already exists.' });
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
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: "Email and password are required." });
    }
    const sql = 'SELECT * FROM users WHERE email = $1';
    try {
        const result = await db.query(sql, [email]);
        if (result.rows.length === 0 || password !== result.rows[0].password_hash) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }
        const user = result.rows[0];
        const tokenPayload = { user: { id: user.id, username: user.username, email: user.email } };
        const token = jwt.sign(tokenPayload, 'your_super_secret_key_12345', { expiresIn: '1h' });
        console.log(`SUCCESSFUL LOGIN for user: ${user.username}`);
        return res.status(200).json({ success: true, message: 'Login successful!', token: token });
    } catch (err) {
        console.error("DB Error on Login:", err);
        return res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});
app.post('/api/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, message: 'Email and OTP are required.' });
    const sql = 'SELECT * FROM users WHERE email = $1 AND otp = $2';
    try {
        const result = await db.query(sql, [email, otp]);
        if (result.rows.length > 0) {
            const clearOtpSql = 'UPDATE users SET otp = NULL, is_verified = 1 WHERE email = $1';
            await db.query(clearOtpSql, [email]);
            return res.status(200).json({ success: true, message: 'Account verified successfully!' });
        } else {
            return res.status(400).json({ success: false, message: 'Invalid OTP or email.' });
        }
    } catch (err) {
        console.error("DB Error on Verify OTP:", err);
        return res.status(500).json({ success: false, message: 'Server error during OTP verification.' });
    }
});
app.get('/api/members', authenticateToken, async (req, res) => {
    const sql = 'SELECT id, username, profile_image_url FROM users WHERE id != $1';
    try {
        const result = await db.query(sql, [req.user.id]);
        return res.status(200).json({ success: true, data: result.rows });
    } catch (err) {
        console.error("DB Error on GET /api/members:", err);
        return res.status(500).json({ success: false, message: "Server error while fetching members." });
    }
});
app.get('/api/profile', authenticateToken, async (req, res) => {
    const sql = 'SELECT username, email, phone, profile_image_url FROM users WHERE id = $1';
    try {
        const result = await db.query(sql, [req.user.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User profile not found.' });
        }
        return res.status(200).json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error("DB Error on GET /api/profile:", err);
        return res.status(500).json({ success: false, message: 'Server error fetching profile.' });
    }
});
app.post('/api/profile/upload-photo', authenticateToken, upload.single('profile_photo'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No photo file was uploaded.' });
    }
    const photoUrl = req.file.path;
    const sql = 'UPDATE users SET profile_image_url = $1 WHERE id = $2';
    try {
        await db.query(sql, [photoUrl, req.user.id]);
        return res.status(200).json({ success: true, message: 'Photo updated!', imageUrl: photoUrl });
    } catch (err) {
        console.error("DB Error on Photo Upload:", err);
        return res.status(500).json({ success: false, message: 'Failed to save photo URL.' });
    }
});

// --- START THE SERVER ---
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running and ready for connections on port ${port}`);
});
