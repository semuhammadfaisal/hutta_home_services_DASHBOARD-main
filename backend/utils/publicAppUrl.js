const CANONICAL_PUBLIC_APP_URL = 'https://hutta-home-services-dashboard-main.onrender.com';

function isPrivateHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true;
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return true;

  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10
    || parts[0] === 0
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

function configuredPublicAppUrl() {
  return String(process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || CANONICAL_PUBLIC_APP_URL).trim();
}

function getPublicAppUrl() {
  const configured = configuredPublicAppUrl();
  let parsed;
  try {
    parsed = new URL(configured);
  } catch (_error) {
    throw new Error('PUBLIC_APP_URL/FRONTEND_URL must be a valid absolute URL');
  }

  if (parsed.protocol !== 'https:' || isPrivateHostname(parsed.hostname)) {
    throw new Error('PUBLIC_APP_URL/FRONTEND_URL must use public HTTPS and cannot point to localhost or a private network');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('PUBLIC_APP_URL/FRONTEND_URL must contain only the dashboard origin');
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error('PUBLIC_APP_URL/FRONTEND_URL must not include a path');
  }
  return parsed.origin;
}

function buildPublicUrl(pathname, fragment) {
  const url = new URL(pathname, `${getPublicAppUrl()}/`);
  if (fragment) url.hash = fragment;
  return url.toString();
}

function validatePublicAppUrl() {
  const publicAppUrl = getPublicAppUrl();
  console.log(`Public application URL configured: ${publicAppUrl}`);
  return publicAppUrl;
}

module.exports = {
  CANONICAL_PUBLIC_APP_URL,
  buildPublicUrl,
  getPublicAppUrl,
  isPrivateHostname,
  validatePublicAppUrl
};
