// =================================================================
// THE DRAWING BOARD: A Simple, Stable server.js (NO OTP)
// =================================================================

const express = require('express');
const { Pool } = require('pg'); // Use the pg Pool for PostgreSQL
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

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

// Test the database connection on startup
db.connect((err, client, release) => {
    if (err) {
        return console.error('FATAL ERROR connecting to PostgreSQL database:', err.stack);
    }
    if (client) client.release();
    console.log('Successfully connected to PostgreSQL Database!');
});

// --- AUTHENTICATION MIDDLEWARE (for future use) ---
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
// --- PUBLIC ROUTES (The Only Routes In This File) ---
// =================================================================

// REGISTER A NEW USER (No email sending, direct success)
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    const password_hash = password; // In a real app, hash this!
    
    // We are only inserting the essential data. No 'otp' column.
    const sql = 'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)';
    try {
        await db.query(sql, [username, email, password_hash]);
        console.log(`SUCCESS: Registered ${username}`);
        // Send a simple success message that allows immediate login.
        return res.status(201).json({ success: true, message: `Registration successful! Please log in.` });
    } catch (err) {
        if (err.code === '23505') { // PostgreSQL error for unique violation
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

// --- START THE SERVER ---
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running and ready for connections on port ${port}`);
});
