const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const session = require('express-session'); // REQUIRED: For session management

const app = express();

// --- Middleware ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // To parse JSON bodies from AJAX calls

// --- Session Middleware Configuration ---
app.use(session({
    secret: 'YOUR_STRONG_RANDOM_SECRET_KEY_HERE', // !! IMPORTANT: CHANGE THIS!!
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 1000 * 60 * 60 * 24, // Session lasts 24 hours
        secure: false // Set to true if using HTTPS
    } 
}));

// --- Static File Serving ---
// Serving root files (index.html, login.html, etc.)
app.use('/', express.static(path.join(__dirname, ''))); 
app.use('/Projects', express.static(path.join(__dirname, 'Projects')));
app.use('/Tutorials', express.static(path.join(__dirname, 'Tutorials')));
app.use('/Datasets', express.static(path.join(__dirname, 'Datasets')));
app.use('/Notes', express.static(path.join(__dirname, 'Notes')));
app.use('/Images', express.static(path.join(__dirname, 'Images')));
app.use('/Assests', express.static(path.join(__dirname, 'Assests')));
app.use('/Login', express.static(path.join(__dirname, 'Login')));
app.use('/Signup', express.static(path.join(__dirname, 'Signup')));
app.use('/Script', express.static(path.join(__dirname, 'Script')));


// --- PostgreSQL Connection ---
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'scodequotlogin',
    password: 'Shubhamsk@135',
    port: 5432,
});

// DB CONNECTION TEST
pool.connect()
    .then(client => {
        console.log('✅ PostgreSQL connected successfully and pool initialized.');
        client.release();
    })
    .catch(err => {
        console.error('❌ FATAL ERROR: PostgreSQL connection failed.', err.message);
    });

// ------------------------------------
// --- GET Routes (Serving HTML Pages) ---
// ------------------------------------

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html')); 
});

// The login page is served normally. Client-side JS will check session status.
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'signup.html'));
});

// ------------------------------------
// --- API Routes (Authentication) ---
// ------------------------------------

// NEW API: Checks the session status on page load (used by login.html)
app.get('/api/session', (req, res) => {
    if (req.session.user) {
        // Logged in: Send user data
        res.status(200).json({ 
            loggedIn: true,
            email: req.session.user.email,
            username: req.session.user.username 
        });
    } else {
        // Not logged in: Send status false
        res.status(200).json({ loggedIn: false });
    }
});


// POST: Signup
app.post('/api/signup', async (req, res) => {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    try {
        // const hashedPassword = await bcrypt.hash(password, 10); 
        
        await pool.query(
            'INSERT INTO users (username, email, password) VALUES ($1, $2, $3)',
            [username, email, password]
        );
        
        res.status(201).json({ message: 'Signup successful! You can now log in.' });
    } catch (err) {
        console.error('*** SIGNUP ERROR:', err.message);
        
        let msg = 'Error during signup.';
        if (err.code === '23505') {
            msg = 'Error: The email address is already registered.';
        }
        
        res.status(500).json({ message: msg });
    }
});


// POST: Login (MODIFIED: Sets session and returns JSON data to client for header update)
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body; 
    
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length > 0) {
            const user = result.rows[0];
            // WARNING: Use bcrypt.compare in a real application! 
            // const match = await bcrypt.compare(password, user.password); 
            const match = password === user.password; // Using simple check for demo
            
            if (match) {
                // SUCCESS: Set the session data!
                req.session.user = { 
                    id: user.id, 
                    email: user.email, 
                    username: user.username 
                };

                // Respond with success JSON including user details for client-side update
                return res.status(200).json({ 
                    message: 'Login successful!', 
                    loggedIn: true,
                    username: user.username,
                    email: user.email
                });
            }
        }
        
        // Failure response (no user found or password mismatch)
        res.status(401).json({ message: 'Invalid email or password.' });

    } catch (err) {
        console.error('*** LOGIN ERROR:', err.message);
        res.status(500).json({ message: 'An error occurred during login.' });
    }
});

// POST: Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ message: 'Could not log out.' });
        }
        // Success: Clear the session
        res.clearCookie('connect.sid'); 
        res.status(200).json({ message: 'Logged out successfully.' });
    });
});

// --- Server Startup ---
const PORT = 5500;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));