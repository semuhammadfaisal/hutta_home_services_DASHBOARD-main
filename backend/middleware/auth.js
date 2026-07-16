const crypto = require('crypto');
const { clearSessionCookie, effectiveExpiry, resolveSession } = require('../utils/authSessions');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function publicUser(user) {
  return {
    userId: String(user._id),
    id: String(user._id),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    phone: user.phone,
    department: user.department,
    avatar: user.avatar
  };
}

function sameValue(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isSameOrigin(req) {
  const source = req.get('origin') || req.get('referer');
  if (!source) return true;
  try {
    const expected = `${req.protocol}://${req.get('host')}`;
    const allowedDevelopmentOrigins = new Set([
      'http://localhost:3000',
      'http://localhost:5500',
      'http://127.0.0.1:5500'
    ]);
    const origin = new URL(source).origin;
    return origin === expected || (process.env.NODE_ENV !== 'production' && allowedDevelopmentOrigins.has(origin));
  } catch (_error) {
    return false;
  }
}

async function authenticateSession(req, res, next) {
  try {
    const userActivity = req.get('x-session-activity') === 'active' || !SAFE_METHODS.has(req.method);
    const resolved = await resolveSession(req, res, { touch: userActivity });
    if (!resolved) {
      clearSessionCookie(res);
      return res.status(401).json({ message: 'Authentication required' });
    }

    req.authSession = resolved.session;
    req.authUser = resolved.user;
    req.user = publicUser(resolved.user);
    res.set('Cache-Control', 'private, no-store, max-age=0');

    if (!SAFE_METHODS.has(req.method)) {
      if (!isSameOrigin(req)) {
        return res.status(403).json({ message: 'Cross-origin request rejected' });
      }
      if (!sameValue(req.get('x-csrf-token'), resolved.session.csrfToken)) {
        return res.status(403).json({ message: 'Invalid CSRF token' });
      }
    }

    next();
  } catch (error) {
    next(error);
  }
}

authenticateSession.publicUser = publicUser;
authenticateSession.isSameOrigin = isSameOrigin;
authenticateSession.sameValue = sameValue;
authenticateSession.sessionPayload = (req) => ({
  user: publicUser(req.authUser),
  csrfToken: req.authSession.csrfToken,
  expiresAt: effectiveExpiry(req.authSession)
});

module.exports = authenticateSession;
