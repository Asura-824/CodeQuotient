const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();

// --- MongoDB Connection ---
// !! IMPORTANT: Set your MongoDB Connection URI !!
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://MyAppUser:Shubhamsk123@cluster0.p6girvj.mongodb.net/?appName=Cluster0'; 

mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB connected successfully.'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- User Model Definition ---
const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true, select: false },
});

// Mongoose Pre-Save Hook: Hash password before saving (Registration)
UserSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});

// Mongoose Method: Compare password (Login)
UserSchema.methods.comparePassword = function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', UserSchema);

// ----------------------------------------------------------------------
// --- Middleware ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- Session Middleware Configuration ---
app.use(session({
    secret: 'YOUR_STRONG_RANDOM_SECRET_KEY_HERE', // !! IMPORTANT: CHANGE THIS!!
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 1000 * 60 * 60 * 24, // Session lasts 24 hours
        secure: false // Set to true if using HTTPS/Production
    } 
}));

// --- Static File Serving ---
app.use('/', express.static(path.join(__dirname, ''))); 
app.use('/Projects', express.static(path.join(__dirname, 'Projects')));
app.use('/Tutorials', express.static(path.join(__dirname, 'Tutorials')));
app.use('/Datasets', express.static(path.join(__dirname, 'Datasets')));
app.use('/Notes', express.static(path.join(__dirname, 'Notes')));
app.use('/Images', express.static(path.join(__dirname, 'Images')));
// Note: Ensure your signup.html and login.html are in the root directory (or update paths)

// ----------------------------------------------------------------------
// --- API Routes (Updated) ---
// ----------------------------------------------------------------------

// 🚀 NEW: GET: Check Session Status 
// This is required by login.html and signup.html to update the header bar on page load.
app.get('/api/session', (req, res) => {
    if (req.session.user) {
        // Return only non-sensitive public info for the client UI
        return res.json({
            loggedIn: true,
            username: req.session.user.username,
            email: req.session.user.email
        });
    }
    res.json({ loggedIn: false });
});

// ✅ FIXED: POST: Signup (Route name changed from /api/register to /api/signup)
app.post('/api/signup', async (req, res) => {
    try {
        const { email, username, password } = req.body;

        // The Mongoose pre-save hook handles password hashing before this is executed
        const newUser = await User.create({ email, username, password });

        return res.status(201).json({ 
            message: 'Registration successful!', 
            userId: newUser._id // MongoDB uses _id
        });
    } catch (err) {
        // Mongoose error code for unique index violation (duplicate key) is 11000
        if (err.code === 11000) {
            return res.status(409).json({ message: 'Email or username already in use.' });
        }
        console.error('*** REGISTRATION ERROR:', err.message);
        res.status(500).json({ message: 'An error occurred during registration.' });
    }
});

// POST: Login (Unchanged, but now fully functional with MongoDB)
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Find user by email and explicitly retrieve the password hash
        const user = await User.findOne({ email }).select('+password');

        if (user) {
            const match = await user.comparePassword(password);

            if (match) {
                // SUCCESS: Set the session data!
                req.session.user = { 
                    id: user._id,
                    email: user.email, 
                    username: user.username 
                };

                return res.status(200).json({ 
                    message: 'Login successful!', 
                    loggedIn: true,
                    username: user.username,
                    email: user.email
                });
            }
        }
        
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
        res.clearCookie('connect.sid'); 
        res.status(200).json({ message: 'Logged out successfully.' });
    });
});

// --- Server Startup ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});