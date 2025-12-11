// =================================================================
// FINAL, COMPLETE, AND STABLE server.js for LOCAL XAMPP/MySQL
// =================================================================

const express = require('express');
const mysql = require('mysql');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// All other required packages
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

const app = express();
app.use(cors());
app.use(express.json());

// --- STABLE LOCAL DATABASE CONNECTION (XAMPP / MySQL) ---
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'vibes24_app' // Your local database name
});

// Test the database connection on startup
db.connect((err) => {
    if (err) {
        return console.error('FATAL ERROR connecting to local MySQL database:', err.stack);
    }
    console.log('Successfully connected to local MySQL Database!');
});

// --- IMAGE UPLOAD (CLOUDINARY) SETUP ---
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

// --- AUTHENTICATION MIDDLEWARE ---
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
// --- PUBLIC ROUTES (LOGIN, REGISTER) ---
// =================================================================
app.post('/api/register', (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    const password_hash = password; // In a real app, hash this!
    const sql = 'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)';
    db.query(sql, [username, email, password_hash], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'That username or email already exists.' });
            console.error("DB Error on Register:", err);
            return res.status(500).json({ success: false, message: 'Server error during registration.' });
        }
        console.log(`SUCCESS: Registered ${username}`);
        return res.status(201).json({ success: true, message: `Registration successful! Please log in.` });
    });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: "Email and password are required." });
    }
    const sql = 'SELECT * FROM users WHERE email = ?';
    db.query(sql, [email], (err, results) => {
        if (err || results.length === 0 || password !== results[0].password_hash) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }
        const user = results[0];
        const tokenPayload = { user: { id: user.id, username: user.username, email: user.email } };
        const token = jwt.sign(tokenPayload, 'your_super_secret_key_12345', { expiresIn: '1h' });
        console.log(`SUCCESSFUL LOGIN for user: ${user.username}`);
        return res.status(200).json({ success: true, message: 'Login successful!', token: token });
    });
});

// =================================================================
// --- PROTECTED ROUTES (MEMBERS, PROFILE, UPLOAD) ---
// =================================================================
app.get('/api/members', authenticateToken, (req, res) => {
    const sql = 'SELECT id, username, profile_image_url FROM users WHERE id != ?';
    db.query(sql, [req.user.id], (err, results) => {
        if (err) {
            console.error("DB Error on GET /api/members:", err);
            return res.status(500).json({ success: false, message: "Server error while fetching members." });
        }
        console.log(`SUCCESS: Fetched ${results.length} members.`);
        return res.status(200).json({ success: true, data: results });
    });
});

app.get('/api/profile', authenticateToken, (req, res) => {
    const sql = 'SELECT username, email, phone, profile_image_url FROM users WHERE id = ?';
    db.query(sql, [req.user.id], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({ success: false, message: 'User profile not found.' });
        }
        return res.status(200).json({ success: true, data: results[0] });
    });
});

app.put('/api/profile', authenticateToken, (req, res) => {
    const { username, email, phone } = req.body;
    const sql = 'UPDATE users SET username = ?, email = ?, phone = ? WHERE id = ?';
    db.query(sql, [username, email, phone, req.user.id], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'That email is already in use.' });
            console.error("DB Error on PUT /api/profile:", err);
            return res.status(500).json({ success: false, message: 'Failed to update profile.' });
        }
        return res.status(200).json({ success: true, message: 'Profile updated!' });
    });
});

app.post('/api/profile/upload-photo', authenticateToken, upload.single('profile_photo'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No photo file was uploaded.' });
    }
    const photoUrl = req.file.path;
    const sql = 'UPDATE users SET profile_image_url = ? WHERE id = ?';
    db.query(sql, [photoUrl, req.user.id], (err, result) => {
        if (err) {
            console.error("DB Error on Photo Upload:", err);
            return res.status(500).json({ success: false, message: 'Failed to save photo URL.' });
        }
        return res.status(200).json({ success: true, message: 'Photo updated!', imageUrl: photoUrl });
    });
});

// --- START THE SERVER ---
const port = 3000;
// THE FIX: We explicitly tell Node.js to listen on all network interfaces.
// This works with the firewall rule to ensure the connection is allowed.
app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running locally and ready for connections on port ${port}`);
});
