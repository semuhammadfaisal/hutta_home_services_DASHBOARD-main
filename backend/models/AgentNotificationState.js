const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'RealEstateTransaction', required: true, unique: true },
  deadlineRiskByOrder: { type: mongoose.Schema.Types.Mixed, default: {} },
  packageReady: { type: Boolean, default: false },
  packageReadyAt: Date
}, { timestamps: true });

module.exports = mongoose.model('AgentNotificationState', schema);
