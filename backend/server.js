const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Set default timezone to Arizona Time (MST / GMT-7, no DST)
process.env.TZ = 'America/Phoenix';

const app = express();
const PORT = process.env.PORT || 10000;

const SLOW_MS = parseInt(process.env.SLOW_REQUEST_MS || '1000', 10);

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error(' Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(' Unhandled Rejection at:', promise, 'reason:', reason);
});

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://hutta-home-services-dashboard.onrender.com',
    'https://hutta-home-services-dashboard-main.onrender.com'
  ],
  credentials: true
}));

app.use(compression({ threshold: 1024 }));

const authRouteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts, please try again later.' }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT_MAX || '800', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' }
});

app.use('/api/auth/login', authRouteLimiter);
app.use('/api/auth/signup', authRouteLimiter);
app.use('/api/auth/forgot-password', authRouteLimiter);
app.use('/api/', apiLimiter);

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Debug middleware to log request body
app.use('/api/vendors', (req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT') {
    console.log('=== VENDOR REQUEST DEBUG ===');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('Documents:', req.body.documents);
    console.log('Documents type:', typeof req.body.documents);
    console.log('Is array:', Array.isArray(req.body.documents));
  }
  next();
});

// Request logging + slow request warning
app.use((req, res, next) => {
  const started = Date.now();
  console.log(`${req.method} ${req.path}`);

  const timeout = setTimeout(() => {
    console.log(` Request timeout: ${req.method} ${req.path}`);
  }, 5000);

  res.on('finish', () => {
    clearTimeout(timeout);
    const ms = Date.now() - started;
    if (ms >= SLOW_MS) {
      console.warn(` Slow request ${ms}ms ${req.method} ${req.originalUrl}`);
    }
  });
  next();
});

// Health check route
app.get('/api/health', async (req, res) => {
  const payload = {
    status: 'OK',
    timestamp: new Date().toLocaleString('en-US', { timeZone: 'America/Phoenix' }),
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    memory: process.memoryUsage(),
    timezone: 'America/Phoenix (MST, GMT-7)'
  };
  res.json(payload);
});

// API Routes with error handling
try {
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/orders', require('./routes/orders'));
  app.use('/api/customers', require('./routes/customers'));
  app.use('/api/vendors', require('./routes/vendors'));
  app.use('/api/employees', require('./routes/employees'));
  app.use('/api/projects', require('./routes/projects'));
  app.use('/api/payments', require('./routes/payments'));
  app.use('/api/notes', require('./routes/notes'));
  app.use('/api/reports', require('./routes/reports'));
  app.use('/api/settings', require('./routes/settings'));
  app.use('/api/notifications', require('./routes/notifications'));
  app.use('/api/stages', require('./routes/stages'));
  app.use('/api/pipeline-records', require('./routes/pipelineRecords'));
  app.use('/api/pipeline-movements', require('./routes/pipelineMovements'));
  app.use('/api/attachments', require('./routes/attachments'));
  const authenticateToken = require('./middleware/auth');
  app.use('/api/upload', authenticateToken, require('./routes/gridfs-upload'));
  app.use('/uploads', authenticateToken, require('./routes/gridfs-upload'));
  console.log(' All routes loaded');
} catch (error) {
  console.error(' Error loading routes:', error);
  process.exit(1);
}

// Serve static files
app.use(express.static(path.join(__dirname, '..'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html');
    }
  }
}));

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

// Catch-all route for SPA
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../index.html'));
  } else {
    res.status(404).json({ message: 'Not found' });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(' Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Connect to MongoDB THEN start server
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10', 10),
      minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE || '0', 10)
    });
    console.log(' MongoDB Connected');
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(' Server running on port', PORT);
      console.log(' API Base: http://localhost:' + PORT + '/api');
      console.log(' Health check: http://localhost:' + PORT + '/api/health');
    });
  } catch (error) {
    console.error(' Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
