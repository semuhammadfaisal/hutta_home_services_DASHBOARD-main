const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { CANONICAL_PUBLIC_APP_URL, validatePublicAppUrl } = require('./utils/publicAppUrl');
const PUBLIC_APP_URL = validatePublicAppUrl();
const authenticateToken = require('./middleware/auth');
const checkRole = require('./middleware/rbac');
const { resolveSession } = require('./utils/authSessions');
const { MAX_BODY_BYTES } = require('./utils/websiteIntake');
const { startIntakeEmailWorker, stopIntakeEmailWorker } = require('./utils/intakeEmailWorker');
const { performanceMiddleware } = require('./utils/performance');

// Set default timezone to Arizona Time (MST / GMT-7, no DST)
process.env.TZ = 'America/Phoenix';

const app = express();
app.set('etag', 'strong');
const PORT = process.env.PORT || 10000;

if (process.env.NODE_ENV === 'production' && String(process.env.HUTTAS_WEBHOOK_SECRET || '').length < 32) {
  throw new Error('HUTTAS_WEBHOOK_SECRET must contain at least 32 characters in production');
}

if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

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
    CANONICAL_PUBLIC_APP_URL,
    PUBLIC_APP_URL
  ],
  credentials: true
}));

app.use(compression({ threshold: 1024, level: 6 }));

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
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buffer) => {
    const requestPath = req.originalUrl?.split('?')[0];
    if (!['/api/integrations/website-requests', '/api/integrations/website-requests/forminator'].includes(requestPath)) return;
    if (buffer.length > MAX_BODY_BYTES) {
      const error = new Error('Website request body is too large');
      error.status = 413;
      throw error;
    }
    req.rawBody = Buffer.from(buffer);
  }
}));
app.use(express.urlencoded({
  limit: '10mb',
  extended: true,
  verify: (req, _res, buffer) => {
    if (req.originalUrl?.split('?')[0] !== '/api/integrations/website-requests/forminator') return;
    if (buffer.length > MAX_BODY_BYTES) {
      const error = new Error('Forminator request body is too large');
      error.status = 413;
      throw error;
    }
    req.rawBody = Buffer.from(buffer);
  }
}));

app.use(performanceMiddleware);
app.use('/api', (req, res, next) => {
  if (req.method === 'GET') res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
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

app.get('/api/health/ready', (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
});

// API Routes with error handling
try {
  // Explicit public API allowlist. Protected endpoints inside these mixed routers
  // apply their own authentication before the default-deny boundary below.
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/vendor-onboarding', require('./routes/vendorOnboarding'));
  app.use('/api/incoming-quotes', require('./routes/incomingQuotes'));
  app.use('/api/outgoing-quotes', require('./routes/outgoingQuotes'));
  app.use('/api/scheduling', require('./routes/scheduling'));
  app.use('/api/integrations', require('./routes/websiteRequests'));

  // Every API mounted after this line requires an active, approved session.
  app.use('/api', authenticateToken);
  app.use('/api/users', checkRole(['admin']), require('./routes/users'));
  app.use('/api/lookups', require('./routes/lookups'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/orders', require('./routes/orders'));
  app.use('/api/customers', require('./routes/customers'));
  app.use('/api/vendors', require('./routes/vendors'));
  app.use('/api/employees', require('./routes/employees'));
  app.use('/api/projects', require('./routes/projects'));
  app.use('/api/payments', checkRole(['admin']), require('./routes/payments'));
  app.use('/api/notes', require('./routes/notes'));
  app.use('/api/reports', checkRole(['admin']), require('./routes/reports'));
  app.use('/api/settings', checkRole(['admin']), require('./routes/settings'));
  app.use('/api/notifications', require('./routes/notifications'));
  app.use('/api/intakes', require('./routes/intakes'));
  app.use('/api/stages', require('./routes/stages'));
  app.use('/api/pipeline-records', require('./routes/pipelineRecords'));
  app.use('/api/pipeline-movements', require('./routes/pipelineMovements'));
  app.use('/api/attachments', require('./routes/attachments'));
  app.use('/api/upload', require('./routes/gridfs-upload'));
  app.use('/uploads', authenticateToken, require('./routes/gridfs-upload'));
  console.log(' All routes loaded');
} catch (error) {
  console.error(' Error loading routes:', error);
  process.exit(1);
}

const staticOptions = {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (!res.hasHeader('Cache-Control')) res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html');
    }
  }
};

app.use(['/assets', '/config', '/components'], (req, res, next) => {
  if (req.query.v) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  next();
});

async function serveDashboard(req, res, next) {
  try {
    const resolved = await resolveSession(req, res);
    if (!resolved) {
      const returnTo = encodeURIComponent('/pages/admin-dashboard.html' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''));
      return res.redirect(302, `/pages/login.html?returnTo=${returnTo}`);
    }
    res.set({
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    return res.sendFile(path.join(__dirname, '../pages/admin-dashboard.html'));
  } catch (error) {
    return next(error);
  }
}

async function serveProtectedPage(req, res, next) {
  try {
    const resolved = await resolveSession(req, res);
    if (!resolved) {
      const returnTo = encodeURIComponent(req.originalUrl.startsWith('/') ? req.originalUrl : '/pages/admin-dashboard.html');
      return res.redirect(302, `/pages/login.html?returnTo=${returnTo}`);
    }
    const fileName = path.posix.basename(req.path);
    res.set({ 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache' });
    return res.sendFile(path.join(__dirname, '../pages', fileName));
  } catch (error) {
    return next(error);
  }
}

app.get(['/pages/admin-dashboard.html', '/admin-dashboard.html'], serveDashboard);

// Public static content is deliberately limited; the repository root and the
// protected dashboard HTML are never exposed through static middleware.
app.use('/assets', express.static(path.join(__dirname, '../assets'), staticOptions));
app.use('/config', express.static(path.join(__dirname, '../config'), staticOptions));
app.use('/components', express.static(path.join(__dirname, '../components'), staticOptions));
app.use('/pages', (req, res, next) => {
  const fileName = path.posix.basename(req.path).toLowerCase();
  if (fileName === 'admin-dashboard.html') return serveDashboard(req, res, next);
  const publicPages = new Set(['login.html', 'signup.html', 'forgot-password.html', 'reset-password.html', 'vendor-onboarding.html', 'vendor-quote.html', 'customer-quote.html', 'vendor-schedule.html']);
  if (fileName.endsWith('.html') && !publicPages.has(fileName)) return serveProtectedPage(req, res, next);
  return next();
}, express.static(path.join(__dirname, '../pages'), { ...staticOptions, index: false }));
app.get('/sw.js', (_req, res) => res.sendFile(path.join(__dirname, '../sw.js')));
app.get('/favicon.ico', (_req, res) => res.sendFile(path.join(__dirname, '../favicon.ico')));

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

// Catch-all route for SPA
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    // Never serve index.html for a missing file. Doing so can execute the root
    // redirect from a nested URL and previously caused /pages/pages/... loops.
    if (path.extname(req.path)) {
      return res.status(404).type('text/plain').send('File not found');
    }
    res.sendFile(path.join(__dirname, '../index.html'));
  } else {
    res.status(404).json({ message: 'Not found' });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  const websiteIntakeRequest = String(req.originalUrl || '').split('?')[0].startsWith('/api/integrations/website-requests');
  if (websiteIntakeRequest) {
    console.error(' Website intake request error:', err?.name || 'request_error');
  } else {
    console.error(' Error:', err);
  }
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' && !websiteIntakeRequest ? err : {}
  });
});

// Connect to MongoDB THEN start server
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      waitQueueTimeoutMS: parseInt(process.env.MONGODB_WAIT_QUEUE_TIMEOUT_MS || '2000', 10),
      maxIdleTimeMS: parseInt(process.env.MONGODB_MAX_IDLE_TIME_MS || '60000', 10),
      maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '20', 10),
      minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE || '2', 10),
      autoIndex: process.env.NODE_ENV !== 'production'
    });
    console.log(' MongoDB Connected');
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(' Server running on port', PORT);
      console.log(' API Base: http://localhost:' + PORT + '/api');
      console.log(' Health check: http://localhost:' + PORT + '/api/health');
      startIntakeEmailWorker();
    });
  } catch (error) {
    console.error(' Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

process.once('SIGTERM', stopIntakeEmailWorker);
process.once('SIGINT', stopIntakeEmailWorker);
