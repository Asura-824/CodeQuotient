const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const session = require('express-session');
const cors = require('cors');
const MongoStore = require('connect-mongo');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

// Environment configuration
const isDevelopment = process.env.NODE_ENV !== 'production';
// FIXED: Combined environment variables for allowed origins more robustly
const allowedOrigins = [
    ...(process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean),
    process.env.CLIENT_ORIGIN
].filter(Boolean);


// Security configurations
const rateLimitConfig = {
    windowMs: (process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000,
    max: process.env.RATE_LIMIT_MAX || 100,
    message: { error: 'Too many requests, please try again later.' }
};

const app = express();

// Trust the proxy headers for secure cookies behind reverse proxies
app.set('trust proxy', 1);

// --- MongoDB Connection ---
// !! IMPORTANT: Ensure this MONGODB_URI is set as an Environment Variable on Vercel/Netlify !!
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://MyAppUser:Shubhamsk123@cluster0.p6girvj.mongodb.net/userDB?appName=Cluster0'; 

mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB connected successfully.'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- User Model Definition ---
const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true, select: false },
});

UserSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});

UserSchema.methods.comparePassword = function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', UserSchema);

// ----------------------------------------------------------------------
// --- Middleware ---
// Security middleware
app.use(helmet({
    contentSecurityPolicy: isDevelopment ? false : undefined,
    crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(rateLimit(rateLimitConfig));

// Custom security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
});

// Enhanced CORS Configuration
app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        // FIXED: Use includes for better flexibility with multiple origins
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        
        const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
        return callback(new Error(msg), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Enhanced Session Configuration
const SESSION_SECRET = process.env.SESSION_SECRET || 'fallback-secret-local-only';

const sessionConfig = {
    store: MongoStore.create({
        mongoUrl: MONGODB_URI,
        collectionName: 'sessions',
        ttl: 24 * 60 * 60, // 24 hours
        autoRemove: 'native',
        crypto: {
            secret: SESSION_SECRET
        }
    }),
    secret: SESSION_SECRET,
    name: 'sessionId', // Don't use default connect.sid
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: !isDevelopment, // Use secure cookies in production
        sameSite: isDevelopment ? 'lax' : 'none', // Required for cross-site deployment
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
};

// Apply session middleware with environment-specific settings
if (!isDevelopment) {
    app.set('trust proxy', 1);
    sessionConfig.cookie.secure = true;
}
app.use(session(sessionConfig));

// ----------------------------------------------------------------------
// 💡 MODIFICATION: Removed the app.get('/') redirect. Let static middleware handle it.
// ----------------------------------------------------------------------

// --- Static File Serving with Security Headers ---
const staticOptions = {
    etag: true,
    lastModified: true,
    // 💡 Added index: to explicitly tell express.static to serve index.html 
    // when the base path (/) is requested.
    index: ['index.html'], 
    setHeaders: (res, path) => {
        // Security headers
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('X-Frame-Options', 'SAMEORIGIN');
        res.set('X-XSS-Protection', '1; mode=block');
        
        // Cache control based on file type
        if (path.endsWith('.html')) {
            res.set('Cache-Control', 'no-cache');
        } else if (path.match(/\.(jpg|jpeg|png|gif|ico)$/)) {
            res.set('Cache-Control', 'public, max-age=86400'); // 24 hours
        } else {
            res.set('Cache-Control', 'public, max-age=3600'); // 1 hour
        }
    }
};

// Serve static files with security configurations
app.use('/', express.static(path.join(__dirname, ''), staticOptions));
app.use('/Projects', express.static(path.join(__dirname, 'Projects'), staticOptions));
app.use('/Tutorials', express.static(path.join(__dirname, 'Tutorials'), staticOptions));
app.use('/Datasets', express.static(path.join(__dirname, 'Datasets'), staticOptions));
app.use('/Notes', express.static(path.join(__dirname, 'Notes'), staticOptions));
app.use('/Images', express.static(path.join(__dirname, 'Images'), staticOptions));

// ----------------------------------------------------------------------
// --- API Routes ---
// ----------------------------------------------------------------------

// GET: Check Session Status 
app.get('/api/session', (req, res) => {
    if (req.session.user) {
        return res.json({
            loggedIn: true,
            username: req.session.user.username,
            email: req.session.user.email
        });
    }
    res.json({ loggedIn: false });
});

// POST: Signup 
app.post('/api/signup', async (req, res) => {
    try {
        const { email, username, password } = req.body;
        
        // Basic input validation
        if (!email || !username || !password) {
             return res.status(400).json({ message: 'All fields are required.' });
        }
        
        const newUser = await User.create({ email, username, password });
        return res.status(201).json({ 
            message: 'Registration successful!', 
            userId: newUser._id
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ message: 'Email or username already in use.' });
        }
        console.error('*** REGISTRATION ERROR:', err.message);
        res.status(500).json({ message: 'An error occurred during registration.' });
    }
});

// POST: Login 
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        if (!email || !password) {
             return res.status(400).json({ message: 'Email and password are required.' });
        }
        
        // Added .select('+password') to retrieve the password hash
        const user = await User.findOne({ email }).select('+password'); 

        if (user && await user.comparePassword(password)) {
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
        
        res.status(401).json({ message: 'Invalid email or password.' });

    } catch (err) {
        console.error('*** LOGIN ERROR:', err.message);
        res.status(500).json({ message: 'An error occurred during login.' });
    }
});

// POST: Logout
app.post('/api/logout', (req, res) => {
    // FIXED: Use the session destroy callback to ensure the response is sent after destruction
    req.session.destroy(err => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ message: 'Could not log out.' });
        }
        
        // FIXED: Clear the custom-named session cookie 'sessionId'
        res.clearCookie(sessionConfig.name); 
        res.status(200).json({ message: 'Logged out successfully.' });
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    const statusCode = err.status || 500;
    const message = isDevelopment ? err.message : 'Internal Server Error';
    
    res.status(statusCode).json({
        error: {
            message,
            ...(isDevelopment && { stack: err.stack })
        }
    });
});

// Handle 404 errors (This is what you are seeing!)
app.use((req, res) => {
    // 💡 Add an attempt to serve index.html if the URL is not found, 
    // which can catch some client-side routing issues.
    if (!req.path.startsWith('/api') && req.method === 'GET') {
        return res.sendFile(path.join(__dirname, 'index.html'));
    }
    
    res.status(404).json({ error: { message: 'Resource not found' } });
});

// --- Server Startup ---
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`Server is running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received. Closing HTTP server...');
    server.close(() => {
        console.log('HTTP server closed.');
        mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed.');
            process.exit(0);
        });
    });
});