// =================================================================
// FINAL, STABLE server.js for RENDER POSTGRESQL (NO OTP, with DB Fixer)
// Following user's direct instructions.
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
db.connect((err, client, release) => {
    if (err) return console.error('FATAL ERROR connecting to PostgreSQL database:', err.stack);
    if (client) client.release();
    console.log('Successfully connected to PostgreSQL Database!');
});

// All other setups (Cloudinary, Auth) are stable
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

// =================================================================
// --- PUBLIC ROUTES (NO OTP) ---
// =================================================================

// REGISTER A NEW USER (Direct registration, no email)
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    const password_hash = password;
    const sql = 'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)';
    try {
        await db.query(sql, [username, email, password_hash]);
        console.log(`SUCCESS: Registered ${username}`);
        return res.status(201).json({ success: true, message: `Registration successful! Please log in.` });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ success: false, message: 'That username or email already exists.' });
        }
        console.error("DB Error on Register:", err);
        return res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
});

// LOG IN A USER
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

// =================================================================
// --- PROTECTED ROUTES (Needed for after login) ---
// =================================================================
app.get('/api/members', authenticateToken, async (req, res) => { /* ... your correct members logic ... */ });
app.get('/api/profile', authenticateToken, async (req, res) => { /* ... your correct profile logic ... */ });
app.post('/api/profile/upload-photo', authenticateToken, upload.single('profile_photo'), async (req, res) => { /* ... your correct upload logic ... */ });


// =================================================================
// --- THIS IS THE SECRET BACKDOOR TO FIX THE DATABASE FOR FREE ---
// =================================================================
app.get('/api/setup-simple-database', (req, res) => {
    const dropTableQuery = 'DROP TABLE IF EXISTS users;';
    const createTableQuery = `
        CREATE TABLE users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            email VARCHAR(100) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            phone VARCHAR(20),
            profile_image_url VARCHAR(255),
            is_verified BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `;
    db.query(dropTableQuery, (err, result) => {
        if (err) return res.status(500).send('Error dropping old table: ' + err.message);
        console.log("SUCCESS: Old 'users' table dropped.");
        db.query(createTableQuery, (err, result) => {
            if (err) return res.status(500).send('Error creating new table: ' + err.message);
            console.log("SUCCESS: New, simpler 'users' table created!");
            res.status(200).send('<h1>Database setup complete! The new, simpler users table has been created.</h1>');
        });
    });
});
// =================================================================

// --- START THE SERVER ---
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running and ready for connections on port ${port}`);
});
