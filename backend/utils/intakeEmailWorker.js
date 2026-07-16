const os = require('os');
const EmailOutbox = require('../models/EmailOutbox');
const IntakeSubmission = require('../models/IntakeSubmission');
const Notification = require('../models/Notification');
const User = require('../models/User');
const {
  sendWebsiteOperationsAlertEmail,
  sendWebsiteRequestConfirmationEmail
} = require('./emailService');

const MAX_ATTEMPTS = 5;
const LOCK_MS = 2 * 60 * 1000;
const POLL_MS = Math.max(1000, parseInt(process.env.INTAKE_EMAIL_POLL_MS || '5000', 10));
const WORKER_ID = `${os.hostname()}:${process.pid}`;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

let timer = null;
let polling = false;

function deliveryField(type) {
  return type === 'website_customer_confirmation' ? 'customerConfirmation' : 'operationsAlert';
}

function errorCategory(error) {
  const text = String(error?.message || '').toLowerCase();
  if (text.includes('not configured')) return 'provider_unconfigured';
  if (text.includes('rate')) return 'provider_rate_limited';
  if (text.includes('timeout')) return 'provider_timeout';
  return 'provider_error';
}

async function claimMessage() {
  const now = new Date();
  return EmailOutbox.findOneAndUpdate({
    attempts: { $lt: MAX_ATTEMPTS },
    $or: [
      {
        status: { $in: ['pending', 'retry_scheduled'] },
        nextAttemptAt: { $lte: now },
        $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: null }, { lockedUntil: { $lte: now } }]
      },
      { status: 'processing', lockedUntil: { $lte: now } }
    ]
  }, {
    $set: {
      status: 'processing',
      lockedBy: WORKER_ID,
      lockedUntil: new Date(now.getTime() + LOCK_MS),
      lastAttemptAt: now
    },
    $inc: { attempts: 1 }
  }, { new: true, sort: { nextAttemptAt: 1, createdAt: 1 } });
}

async function recoverExhaustedMessages() {
  const now = new Date();
  const messages = await EmailOutbox.find({
    status: { $in: ['pending', 'processing', 'retry_scheduled'] },
    attempts: { $gte: MAX_ATTEMPTS },
    $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: null }, { lockedUntil: { $lte: now } }]
  }).limit(10);
  for (const message of messages) {
    const category = message.lastErrorCategory || 'worker_interrupted';
    const changed = await EmailOutbox.updateOne({
      _id: message._id,
      status: { $in: ['pending', 'processing', 'retry_scheduled'] }
    }, {
      $set: { status: 'permanently_failed', lockedUntil: null, lockedBy: null, lastErrorCategory: category }
    });
    if (!changed.modifiedCount) continue;
    await markIntakeDelivery(message, { status: 'permanently_failed', attempts: message.attempts, lastAttemptAt: message.lastAttemptAt || now, lastErrorCategory: category });
    await alertPermanentFailure(message, category);
  }
}

async function markIntakeDelivery(message, update) {
  const field = deliveryField(message.type);
  const mapped = {};
  for (const [key, value] of Object.entries(update)) mapped[`${field}.${key}`] = value;
  await IntakeSubmission.updateOne({ _id: message.intakeSubmissionId }, { $set: mapped });
}

async function alertPermanentFailure(message, category) {
  const users = await User.find({ isActive: true, role: { $in: ['admin', 'manager', 'account_rep'] } }).select('_id').lean();
  if (!users.length) return;
  const kind = message.type === 'website_customer_confirmation' ? 'customer confirmation' : 'operations alert';
  await Notification.insertMany(users.map(user => ({
    userId: user._id,
    title: 'Website request email failed',
    message: `${kind} for ${message.payload.requestReference} failed after ${MAX_ATTEMPTS} attempts.`,
    type: 'error',
    priority: 'high',
    actionUrl: '#workflow-center',
    metadata: { intakeSubmissionId: message.intakeSubmissionId, orderId: message.orderId, emailType: message.type, category }
  })));
}

async function deliverMessage(message) {
  const sender = message.type === 'website_customer_confirmation'
    ? sendWebsiteRequestConfirmationEmail
    : sendWebsiteOperationsAlertEmail;
  try {
    const result = await sender({ recipients: message.recipients, ...message.payload });
    const now = new Date();
    await EmailOutbox.updateOne({ _id: message._id, lockedBy: WORKER_ID }, {
      $set: {
        status: 'sent',
        sentAt: now,
        provider: result?.provider || null,
        providerMessageId: result?.messageId || null,
        lastErrorCategory: null,
        lockedUntil: null,
        lockedBy: null
      }
    });
    await markIntakeDelivery(message, { status: 'sent', attempts: message.attempts, lastAttemptAt: now, sentAt: now, lastErrorCategory: null });
  } catch (error) {
    const category = errorCategory(error);
    const permanent = message.attempts >= MAX_ATTEMPTS;
    const now = new Date();
    const nextAttemptAt = permanent ? null : new Date(now.getTime() + RETRY_DELAYS_MS[Math.min(message.attempts - 1, RETRY_DELAYS_MS.length - 1)]);
    await EmailOutbox.updateOne({ _id: message._id, lockedBy: WORKER_ID }, {
      $set: {
        status: permanent ? 'permanently_failed' : 'retry_scheduled',
        nextAttemptAt,
        lastErrorCategory: category,
        lockedUntil: null,
        lockedBy: null
      }
    });
    await markIntakeDelivery(message, {
      status: permanent ? 'permanently_failed' : 'retry_scheduled',
      attempts: message.attempts,
      lastAttemptAt: now,
      lastErrorCategory: category
    });
    if (permanent) await alertPermanentFailure(message, category);
    console.warn(`Intake email ${message.type} failed for ${message.payload.requestReference}: ${category}`);
  }
}

async function pollOnce() {
  if (polling) return;
  polling = true;
  try {
    await recoverExhaustedMessages();
    let processed = 0;
    while (processed < 10) {
      const message = await claimMessage();
      if (!message) break;
      await deliverMessage(message);
      processed += 1;
    }
  } catch (error) {
    console.error('Intake email worker poll failed:', error?.name || 'unknown');
  } finally {
    polling = false;
  }
}

function startIntakeEmailWorker() {
  if (process.env.INTAKE_EMAIL_WORKER_ENABLED === 'false' || timer) return;
  timer = setInterval(pollOnce, POLL_MS);
  timer.unref?.();
  setImmediate(pollOnce);
  console.log(' Intake email outbox worker started');
}

function stopIntakeEmailWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  MAX_ATTEMPTS,
  RETRY_DELAYS_MS,
  pollOnce,
  startIntakeEmailWorker,
  stopIntakeEmailWorker,
  _test: { errorCategory }
};
