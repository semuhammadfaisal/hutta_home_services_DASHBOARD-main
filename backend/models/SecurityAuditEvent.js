const mongoose = require('mongoose');

const securityAuditEventSchema = new mongoose.Schema({
  action: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userEmail: String,
  entityType: String,
  entityId: String,
  ipAddress: String,
  userAgent: String,
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

securityAuditEventSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

module.exports = mongoose.model('SecurityAuditEvent', securityAuditEventSchema);
