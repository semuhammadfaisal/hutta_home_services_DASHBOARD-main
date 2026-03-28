const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 10000;

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
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

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  
  // Add timeout to detect hanging requests
  const timeout = setTimeout(() => {
    console.log(`⚠️ Request timeout: ${req.method} ${req.path}`);
  }, 5000);
  
  res.on('finish', () => clearTimeout(timeout));
  next();
});

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API Routes with error handling
try {
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/orders', require('./routes/orders'));
  app.use('/api/customers', require('./routes/customers'));
  app.use('/api/vendors', require('./routes/vendors'));
  app.use('/api/employees', require('./routes/employees'));
  app.use('/api/projects', require('./routes/projects'));
  app.use('/api/payments', require('./routes/payments'));
  app.use('/api/reports', require('./routes/reports'));
  app.use('/api/settings', require('./routes/settings'));
  app.use('/api/notifications', require('./routes/notifications'));
  app.use('/api/stages', require('./routes/stages'));
  app.use('/api/pipeline-records', require('./routes/pipelineRecords'));
  app.use('/api/pipeline-movements', require('./routes/pipelineMovements'));
  app.use('/api/upload', require('./routes/gridfs-upload'));
  app.use('/uploads', require('./routes/gridfs-upload'));
  console.log('✅ All routes loaded');
} catch (error) {
  console.error('❌ Error loading routes:', error);
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
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Connect to MongoDB THEN start server
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });
    console.log('✅ MongoDB Connected');
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log('✅ Server running on port', PORT);
      console.log('✅ API Base: http://localhost:' + PORT + '/api');
      console.log('✅ Health check: http://localhost:' + PORT + '/api/health');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();