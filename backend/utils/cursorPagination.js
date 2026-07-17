const mongoose = require('mongoose');

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 160);
}

function prefixRegex(value) {
  const normalized = normalizeSearch(value);
  if (!normalized) return null;
  return new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
}

function encodeCursor(doc, field = 'createdAt') {
  if (!doc?._id) return null;
  const value = doc[field] instanceof Date ? doc[field].toISOString() : doc[field];
  return Buffer.from(JSON.stringify({ value, id: String(doc._id) })).toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (!parsed.id || !mongoose.Types.ObjectId.isValid(parsed.id)) return null;
    return { value: parsed.value, id: new mongoose.Types.ObjectId(parsed.id) };
  } catch (_) { return null; }
}

function cursorFilter(cursor, field = 'createdAt', direction = -1, valueType = 'date') {
  const decoded = decodeCursor(cursor);
  if (!decoded) return null;
  let value = decoded.value;
  if (valueType === 'date') {
    value = new Date(value);
    if (Number.isNaN(value.getTime())) return null;
  }
  const op = direction === -1 ? '$lt' : '$gt';
  return { $or: [{ [field]: { [op]: value } }, { [field]: value, _id: { [op]: decoded.id } }] };
}

function parseLimit(value, fallback = 50, maximum = 100) {
  return Math.min(maximum, Math.max(1, Number.parseInt(value, 10) || fallback));
}

function pagePayload(rows, total, limit, field = 'createdAt') {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return { data, pagination: { total, limit, nextCursor: hasMore ? encodeCursor(data[data.length - 1], field) : null, hasMore } };
}

module.exports = { normalizeSearch, prefixRegex, encodeCursor, decodeCursor, cursorFilter, parseLimit, pagePayload };
