// =================================================================
// FINAL, COMPLETE, AND STABLE server.js FOR VIBES24 (Production Ready)
// NO OTP, for PostgreSQL, NO BACKDOOR
// =================================================================

const express = require('express');
const { Pool } = require('pg'); // Use the pg Pool for PostgreSQL
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// All other packages needed for all features
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

const app = express();
app.use(cors());
app.use(express.json());

// --- STABLE LIVE DATABASE CONNECTION (RENDER POSTGRESQL) ---
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});
db.connect((err) => {
    if (err) return console.error('FATAL ERROR connecting to PostgreSQL database:', err.stack);
    console.log('Successfully connected to PostgreSQL Database!');
});

// All other setups are stable
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: { folder: 'vibes24_profiles', format: 'jpg' }
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

// --- PUBLIC ROUTES (NO OTP) ---
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ success: false, message: 'All fields are required.' });
    const password_hash = password;
    const sql = 'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)'; // Using $1 for postgres
    try {
        await db.query(sql, [username, email, password_hash]);
        console.log(`SUCCESS: Registered ${username}`);
        return res.status(201).json({ success: true, message: `Registration successful! Please log in.` });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ success: false, message: 'That username or email already exists.' });
        console.error("DB Error on Register:", err);
        return res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: "Email and password are required." });
    const sql = 'SELECT * FROM users WHERE email = $1'; // Using $1 for postgres
    try {
        const result = await db.query(sql, [email]);
        if (result.rows.length === 0 || password !== result.rows[0].password_hash) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }
        const user = result.rows[0];
        const tokenPayload = { user: { id: user.id, username: user.username, email: user.email } };
        const token = jwt.sign(tokenPayload, 'your_super_secret_key_12345', { expiresIn: '1h' });
        return res.status(200).json({ success: true, message: 'Login successful!', token: token });
    } catch (err) {
        console.error("DB Error on Login:", err);
        return res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});

// --- PROTECTED ROUTES ---
app.get('/api/match-candidates', authenticateToken, async (req, res) => {
    const sql = 'SELECT id, username, profile_image_url FROM users WHERE id != $1'; // Using $1 for postgres
    try {
        const result = await db.query(sql, [req.user.id]);
        return res.status(200).json({ success: true, data: result.rows });
    } catch (err) {
        return res.status(500).json({ success: false, message: "Server error while fetching candidates." });
    }
});

app.get('/api/user/:id', authenticateToken, async (req, res) => {
    const userIdToFetch = req.params.id;
    const sql = 'SELECT id, username, email, phone, profile_image_url FROM users WHERE id = $1';
    try {
        const result = await db.query(sql, [userIdToFetch]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found.' });
        return res.status(200).json({ success: true, data: result.rows[0] });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Server error fetching user profile.' });
    }
});

app.get('/api/profile', authenticateToken, async (req, res) => {
    const sql = 'SELECT username, email, phone, profile_image_url FROM users WHERE id = $1';
    try {
        const result = await db.query(sql, [req.user.id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User profile not found.' });
        return res.status(200).json({ success: true, data: result.rows[0] });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Server error fetching profile.' });
    }
});

app.put('/api/profile', authenticateToken, async (req, res) => {
    const { username, email, phone } = req.body;
    const sql = 'UPDATE users SET username = $1, email = $2, phone = $3 WHERE id = $4';
    try {
        await db.query(sql, [username, email, phone, req.user.id]);
        return res.status(200).json({ success: true, message: 'Profile updated!' });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ success: false, message: 'That email is already in use.' });
        return res.status(500).json({ success: false, message: 'Failed to update profile.' });
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
        return res.status(500).json({ success: false, message: 'Failed to save photo URL.' });
    }
});

// --- START THE SERVER ---
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running and ready for connections on port ${port}`);
});
