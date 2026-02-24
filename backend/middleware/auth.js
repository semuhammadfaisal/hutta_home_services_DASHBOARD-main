const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log('❌ No token for:', req.method, req.originalUrl);
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    req.user = user;
    next();
  } catch (err) {
    console.log('❌ Invalid token for:', req.method, req.originalUrl);
    return res.status(403).json({ message: 'Invalid token' });
  }
};

module.exports = authenticateToken;