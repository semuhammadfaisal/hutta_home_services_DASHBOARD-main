const mongoose = require('mongoose');

const authSessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  csrfToken: { type: String, required: true },
  createdAt: { type: Date, required: true, default: Date.now },
  lastActivityAt: { type: Date, required: true, default: Date.now },
  absoluteExpiresAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { versionKey: false });

authSessionSchema.index({ userId: 1, expiresAt: 1 });

module.exports = mongoose.model('AuthSession', authSessionSchema);
