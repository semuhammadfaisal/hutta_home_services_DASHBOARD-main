const jwt = require('jsonwebtoken');

const MAX_CACHE = 512;
const TTL_MS = 4 * 60 * 1000;
const tokenCache = new Map();

function cacheToken(token, payload) {
  if (tokenCache.size >= MAX_CACHE) {
    const firstKey = tokenCache.keys().next().value;
    tokenCache.delete(firstKey);
  }
  tokenCache.set(token, { payload, expiresAt: Date.now() + TTL_MS });
}

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log(' No token for:', req.method, req.originalUrl);
    return res.status(401).json({ message: 'Access token required' });
  }

  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    req.user = cached.payload;
    return next();
  }
  if (cached) tokenCache.delete(token);

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    cacheToken(token, user);
    req.user = user;
    next();
  } catch (err) {
    console.log(' Invalid token for:', req.method, req.originalUrl);
    return res.status(403).json({ message: 'Invalid token' });
  }
};

module.exports = authenticateToken;