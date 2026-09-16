const crypto = require('crypto');
const { clearSessionCookie, effectiveExpiry, resolveSession } = require('../utils/authSessions');
const { CANONICAL_PUBLIC_APP_URL, getPublicAppUrl } = require('../utils/publicAppUrl');

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

function destinationForRole(role, requestedPath = '') {
  const residential = role === 'residential';
  const agent = role === 'real_estate_agent';
  const commercial = role === 'commercial';
  const vendor = role === 'vendor';
  const fallback = residential ? '/pages/residential-portal.html' : agent ? '/pages/agent-portal.html' : commercial ? '/pages/commercial-portal.html' : vendor ? '/pages/vendor-portal.html' : '/pages/admin-dashboard.html';
  if (typeof requestedPath !== 'string' || !requestedPath.startsWith('/') || requestedPath.startsWith('//')) return fallback;
  try {
    const parsed = new URL(requestedPath, 'https://app.smplfix.com');
    const allowed = residential
      ? new Set(['/pages/residential-portal.html', '/residential-portal.html', '/pages/agent-invitation.html', '/agent-invitation.html'])
      : agent
        ? new Set(['/pages/agent-portal.html', '/agent-portal.html'])
        : commercial
          ? new Set(['/pages/commercial-portal.html', '/commercial-portal.html', '/pages/commercial-invitation.html', '/commercial-invitation.html'])
        : vendor
          ? new Set(['/pages/vendor-portal.html', '/vendor-portal.html'])
      : new Set(['/pages/admin-dashboard.html', '/admin-dashboard.html']);
    return allowed.has(parsed.pathname) ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
  } catch (_error) {
    return fallback;
  }
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
    const trustedOrigins = new Set([expected, CANONICAL_PUBLIC_APP_URL]);
    try {
      trustedOrigins.add(getPublicAppUrl());
    } catch (_error) {
      // Server startup validates this setting; keep request checks fail-closed.
    }
    const allowedDevelopmentOrigins = new Set([
      'http://localhost:3000',
      'http://localhost:5500',
      'http://127.0.0.1:5500'
    ]);
    const origin = new URL(source).origin;
    return trustedOrigins.has(origin)
      || (process.env.NODE_ENV !== 'production' && allowedDevelopmentOrigins.has(origin));
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
        return res.status(403).json({ message: 'Invalid CSRF token', code: 'CSRF_INVALID' });
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
authenticateSession.destinationForRole = destinationForRole;
authenticateSession.sessionPayload = (req, requestedPath = '') => ({
  user: publicUser(req.authUser),
  csrfToken: req.authSession.csrfToken,
  expiresAt: effectiveExpiry(req.authSession),
  destination: destinationForRole(req.authUser.role, requestedPath)
});

module.exports = authenticateSession;
