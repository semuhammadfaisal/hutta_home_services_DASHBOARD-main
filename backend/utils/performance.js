const crypto = require('crypto');

const SLOW_REQUEST_MS = Math.max(100, Number(process.env.SLOW_REQUEST_MS || 1000));
const MAX_LIST_BYTES = Math.max(1024, Number(process.env.MAX_LIST_RESPONSE_BYTES || 256000));

function routeLabel(req) {
  const routePath = req.route?.path;
  if (routePath) return `${req.baseUrl || ''}${routePath}`;
  return String(req.originalUrl || req.path || '').split('?')[0];
}

function performanceMiddleware(req, res, next) {
  const started = process.hrtime.bigint();
  const requestId = crypto.randomBytes(6).toString('hex');
  res.setHeader('X-Request-Id', requestId);
  const originalWriteHead = res.writeHead;
  res.writeHead = function performanceWriteHead(...args) {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    if (!res.hasHeader('Server-Timing')) res.setHeader('Server-Timing', `total;dur=${durationMs.toFixed(1)}`);
    return originalWriteHead.apply(this, args);
  };

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    const bytes = Number(res.getHeader('content-length') || 0);
    if (durationMs >= SLOW_REQUEST_MS || (bytes > MAX_LIST_BYTES && req.method === 'GET')) {
      console.warn(JSON.stringify({
        event: 'request_performance', requestId, method: req.method,
        route: routeLabel(req), status: res.statusCode,
        durationMs: Number(durationMs.toFixed(1)), responseBytes: bytes
      }));
    }
  });
  next();
}

function privateRevalidate(seconds = 30) {
  return (_req, res, next) => {
    res.setHeader('Cache-Control', `private, max-age=${seconds}, stale-while-revalidate=${seconds * 2}`);
    next();
  };
}

module.exports = { performanceMiddleware, privateRevalidate };
