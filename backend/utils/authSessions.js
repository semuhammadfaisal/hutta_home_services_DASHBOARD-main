const crypto = require('crypto');
const AuthSession = require('../models/AuthSession');
const User = require('../models/User');

const COOKIE_NAME = 'hutta.sid';
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseCookies(header = '') {
  return header.split(';').reduce((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return cookies;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) cookies[name] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function cookieOptions(maxAge = IDLE_TIMEOUT_MS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge
  };
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(0), maxAge: undefined });
}

function effectiveExpiry(session) {
  const idleExpiry = new Date(session.lastActivityAt).getTime() + IDLE_TIMEOUT_MS;
  return new Date(Math.min(idleExpiry, new Date(session.absoluteExpiresAt).getTime()));
}

function isSessionExpired(session, now = Date.now()) {
  return (
    now - new Date(session.lastActivityAt).getTime() >= IDLE_TIMEOUT_MS ||
    now >= new Date(session.absoluteExpiresAt).getTime()
  );
}

async function createSession(user, res) {
  const now = new Date();
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const absoluteExpiresAt = new Date(now.getTime() + ABSOLUTE_TIMEOUT_MS);
  const expiresAt = new Date(now.getTime() + IDLE_TIMEOUT_MS);
  const session = await AuthSession.create({
    tokenHash: hashToken(rawToken),
    userId: user._id,
    csrfToken: crypto.randomBytes(32).toString('base64url'),
    createdAt: now,
    lastActivityAt: now,
    absoluteExpiresAt,
    expiresAt
  });
  res.cookie(COOKIE_NAME, rawToken, cookieOptions(IDLE_TIMEOUT_MS));
  return session;
}

async function resolveSession(req, res, { touch = true } = {}) {
  const rawToken = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!rawToken) return null;

  const session = await AuthSession.findOne({ tokenHash: hashToken(rawToken) });
  if (!session) return null;

  const now = Date.now();
  if (isSessionExpired(session, now)) {
    await session.deleteOne();
    clearSessionCookie(res);
    return null;
  }

  const user = await User.findById(session.userId);
  if (!user || !user.isActive || !['admin', 'manager', 'account_rep'].includes(user.role)) {
    await session.deleteOne();
    clearSessionCookie(res);
    return null;
  }

  if (touch && now - new Date(session.lastActivityAt).getTime() >= TOUCH_INTERVAL_MS) {
    session.lastActivityAt = new Date(now);
    session.expiresAt = effectiveExpiry(session);
    await session.save();
  }

  const remaining = Math.max(0, Math.min(
    IDLE_TIMEOUT_MS,
    new Date(session.absoluteExpiresAt).getTime() - now
  ));
  if (touch) res.cookie(COOKIE_NAME, rawToken, cookieOptions(remaining));

  return { session, user };
}

async function revokeSession(session) {
  if (session) await AuthSession.deleteOne({ _id: session._id });
}

async function revokeUserSessions(userId) {
  if (userId) await AuthSession.deleteMany({ userId });
}

module.exports = {
  ABSOLUTE_TIMEOUT_MS,
  COOKIE_NAME,
  IDLE_TIMEOUT_MS,
  clearSessionCookie,
  createSession,
  effectiveExpiry,
  isSessionExpired,
  resolveSession,
  revokeSession,
  revokeUserSessions
};
