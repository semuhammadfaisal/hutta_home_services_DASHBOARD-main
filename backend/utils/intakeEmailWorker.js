const os = require('os');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const sharp = require('sharp');
const EmailOutbox = require('../models/EmailOutbox');
const IntakeSubmission = require('../models/IntakeSubmission');
const Notification = require('../models/Notification');
const QuoteInvitation = require('../models/QuoteInvitation');
const OutgoingQuote = require('../models/OutgoingQuote');
const JobSchedule = require('../models/JobSchedule');
const JobCompletion = require('../models/JobCompletion');
const CustomerInvoice = require('../models/CustomerInvoice');
const CustomerSatisfactionDecision = require('../models/CustomerSatisfactionDecision');
const Order = require('../models/Order');
const VendorWorkOrder = require('../models/VendorWorkOrder');
const User = require('../models/User');
const {
  sendVendorQuoteInvitationEmail,
  sendVendorQuoteStaffAlertEmail,
  sendVendorQuoteSubmissionConfirmationEmail,
  sendCustomerOutgoingQuoteEmail,
  sendCustomerQuoteDecisionEmail,
  sendStaffQuoteDecisionAlertEmail,
  sendVendorScheduleProposalEmail,
  sendCustomerScheduleEmail,
  sendVendorScheduleDecisionEmail,
  sendStaffScheduleAlertEmail,
  sendVendorCompletionLinkEmail,
  sendVendorCompletionConfirmationEmail,
  sendCustomerCompletionSatisfactionEmail,
  sendCustomerSatisfactionResultEmail,
  sendStaffCloseoutEmail,
  sendCustomerPaymentProofEmail,
  sendStaffPaymentProofEmail,
  sendWebsiteOperationsAlertEmail,
  sendWebsiteRequestConfirmationEmail
} = require('./emailService');
const { decryptToken, hashToken } = require('./incomingQuotes');
const { decryptToken: decryptOutgoingToken, hashToken: hashOutgoingToken } = require('./outgoingQuotes');
const { decryptToken: decryptScheduleToken, hashToken: hashScheduleToken } = require('./scheduling');
const { decryptToken: decryptIntakeToken, hashToken: hashIntakeToken } = require('./intakeCompletion');
const { decryptToken: decryptCloseoutToken, hashToken: hashCloseoutToken } = require('./closeout');
const { createVendorWorkOrderPdf } = require('./workOrderPdf');
const { createCustomerInvoicePdf } = require('./invoicePdf');

const MAX_ATTEMPTS = 5;
const LOCK_MS = 2 * 60 * 1000;
const POLL_MS = Math.max(1000, parseInt(process.env.INTAKE_EMAIL_POLL_MS || '5000', 10));
const WORKER_ID = `${os.hostname()}:${process.pid}`;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
const OUTGOING_TOKEN_TYPES = new Set([
  'customer_outgoing_quote',
  'customer_quote_approval_confirmation',
  'customer_quote_change_confirmation'
]);
const STAGE4_TYPES = new Set([
  'customer_quote_approval_confirmation',
  'staff_quote_approval_alert',
  'customer_quote_change_confirmation',
  'staff_quote_change_alert'
]);
const STAGE5_TYPES = new Set(['vendor_schedule_proposal', 'vendor_schedule_accepted_confirmation', 'customer_schedule_confirmation', 'staff_schedule_accepted_alert', 'vendor_schedule_change_confirmation', 'staff_schedule_change_alert']);
const CLOSEOUT_TYPES = new Set([
  'vendor_completion_link','vendor_completion_confirmation','customer_completion_satisfaction',
  'customer_satisfaction_followup','customer_satisfaction_confirmation','customer_issue_confirmation',
  'staff_completion_alert','staff_satisfaction_alert','staff_closeout_issue_alert','staff_closeout_issue_resolved',
  'customer_closeout_review','customer_closeout_followup','customer_closeout_confirmation',
  'customer_closeout_issue_confirmation','customer_closeout_issue_resolved',
  'customer_payment_proof_received','staff_payment_proof_alert',
  'customer_payment_proof_verified','customer_payment_proof_rejected'
]);

let timer = null;
let polling = false;
let lastOrphanCleanupAt = 0;

async function cleanupCloseoutOrphans() {
  if (!mongoose.connection.db || Date.now() - lastOrphanCleanupAt < 60 * 60 * 1000) return;
  lastOrphanCleanupAt = Date.now();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const files = await mongoose.connection.db.collection('uploads.files').find({
    'metadata.jobCompletionId': { $exists: true },
    'metadata.linkStatus': 'pending',
    uploadDate: { $lt: cutoff }
  }).project({ _id: 1 }).limit(50).toArray();
  if (!files.length) return;
  const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
  await Promise.allSettled(files.map(file => bucket.delete(file._id)));
}
async function readGridFsBuffer(fileId) {
  if (!fileId) return null;
  const chunks=[];
  await new Promise((resolve,reject)=>{
    const stream=new GridFSBucket(mongoose.connection.db,{bucketName:'uploads'}).openDownloadStream(fileId);
    stream.on('data',chunk=>chunks.push(chunk));stream.once('end',resolve);stream.once('error',reject);
  });
  return Buffer.concat(chunks);
}
async function evidencePreviewAttachment(file, contentId, label) {
  if (!file?.fileId) return null;
  const original=await readGridFsBuffer(file.fileId);
  const content=await sharp(original).rotate().resize({width:640,height:480,fit:'inside',withoutEnlargement:true}).jpeg({quality:78,mozjpeg:true}).toBuffer();
  // Resend maps this property to the API's inline_content_id field.
  return {filename:`${label}.jpg`,content,contentType:'image/jpeg',inlineContentId:contentId};
}

function deliveryField(type) {
  return type === 'website_customer_confirmation' ? 'customerConfirmation' : 'operationsAlert';
}

function isIntakeMessage(type) {
  return type === 'website_customer_confirmation' || type === 'website_operations_alert';
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
    await markQuoteDelivery(message, { status: 'permanently_failed', lastErrorCategory: category });
    await alertPermanentFailure(message, category);
  }
}

async function markIntakeDelivery(message, update) {
  if (!isIntakeMessage(message.type) || !message.intakeSubmissionId) return;
  const field = deliveryField(message.type);
  const mapped = {};
  for (const [key, value] of Object.entries(update)) mapped[`${field}.${key}`] = value;
  await IntakeSubmission.updateOne({ _id: message.intakeSubmissionId }, { $set: mapped });
}

async function markQuoteDelivery(message, update) {
  if (message.outgoingQuoteId && message.type === 'customer_outgoing_quote') {
    await OutgoingQuote.updateOne({ _id: message.outgoingQuoteId }, { $set: { deliveryStatus: update.status === 'sent' ? 'sent' : update.status } });
  }
  if (!message.quoteInvitationId) return;
  const set = {};
  if (update.status === 'sent' && ['vendor_quote_invitation', 'vendor_quote_revision_request'].includes(message.type)) {
    set.status = 'sent';
    set.sentAt = update.sentAt;
    set.lastDeliveryProvider = update.provider || undefined;
    set.lastDeliveryMessageId = update.providerMessageId || undefined;
    set.lastDeliveryError = undefined;
  } else if (update.status === 'permanently_failed' && ['vendor_quote_invitation', 'vendor_quote_revision_request'].includes(message.type)) {
    set.status = 'delivery_failed';
    set.lastDeliveryError = update.lastErrorCategory;
  }
  if (Object.keys(set).length) await QuoteInvitation.updateOne({ _id: message.quoteInvitationId, status: { $nin: ['submitted', 'revoked'] } }, { $set: set });
}

async function alertPermanentFailure(message, category) {
  const users = await User.find({ isActive: true, role: { $in: ['admin', 'manager', 'account_rep'] } }).select('_id').lean();
  if (!users.length) return;
  const intake = isIntakeMessage(message.type);
  const outgoing = message.type === 'customer_outgoing_quote' || STAGE4_TYPES.has(message.type);
  const kind = intake ? (message.type === 'website_customer_confirmation' ? 'customer confirmation' : 'operations alert') : message.type.replaceAll('_', ' ');
  await Notification.insertMany(users.map(user => ({
    userId: user._id,
    title: intake ? 'Website request email failed' : CLOSEOUT_TYPES.has(message.type) ? 'Closeout email failed' : STAGE5_TYPES.has(message.type) ? 'Scheduling email failed' : outgoing ? 'Customer quote email failed' : 'Vendor quote email failed',
    message: `${kind} for ${message.payload.requestReference || message.payload.quoteReference} failed after ${MAX_ATTEMPTS} attempts.`,
    type: 'error',
    priority: 'high',
    actionUrl: intake ? '#workflow-center' : CLOSEOUT_TYPES.has(message.type) ? '#workflow-center/stage-6' : STAGE5_TYPES.has(message.type) ? '#scheduling' : STAGE4_TYPES.has(message.type) ? '#customer-approvals' : outgoing ? '#outgoing-quotes' : '#incoming-quotes',
    metadata: { intakeSubmissionId: message.intakeSubmissionId, incomingQuoteId: message.incomingQuoteId, quoteInvitationId: message.quoteInvitationId, outgoingQuoteId: message.outgoingQuoteId, jobScheduleId: message.jobScheduleId, vendorWorkOrderId: message.vendorWorkOrderId, jobCompletionId: message.jobCompletionId, customerInvoiceId: message.customerInvoiceId, satisfactionDecisionId: message.satisfactionDecisionId, orderId: message.orderId, emailType: message.type, category }
  })));
}

async function deliverMessage(message) {
  const senders = {
    website_customer_confirmation: sendWebsiteRequestConfirmationEmail,
    website_operations_alert: sendWebsiteOperationsAlertEmail,
    vendor_quote_invitation: sendVendorQuoteInvitationEmail,
    vendor_quote_revision_request: sendVendorQuoteInvitationEmail,
    vendor_quote_submission_confirmation: sendVendorQuoteSubmissionConfirmationEmail,
    vendor_quote_staff_alert: sendVendorQuoteStaffAlertEmail,
    customer_outgoing_quote: sendCustomerOutgoingQuoteEmail,
    customer_quote_approval_confirmation: sendCustomerQuoteDecisionEmail,
    staff_quote_approval_alert: sendStaffQuoteDecisionAlertEmail,
    customer_quote_change_confirmation: sendCustomerQuoteDecisionEmail,
    staff_quote_change_alert: sendStaffQuoteDecisionAlertEmail,
    vendor_schedule_proposal: sendVendorScheduleProposalEmail,
    vendor_schedule_accepted_confirmation: sendVendorScheduleDecisionEmail,
    customer_schedule_confirmation: sendCustomerScheduleEmail,
    staff_schedule_accepted_alert: sendStaffScheduleAlertEmail,
    vendor_schedule_change_confirmation: sendVendorScheduleDecisionEmail,
    staff_schedule_change_alert: sendStaffScheduleAlertEmail
    ,vendor_completion_link: sendVendorCompletionLinkEmail
    ,vendor_completion_confirmation: sendVendorCompletionConfirmationEmail
    ,customer_completion_satisfaction: sendCustomerCompletionSatisfactionEmail
    ,customer_satisfaction_followup: sendCustomerCompletionSatisfactionEmail
    ,customer_satisfaction_confirmation: sendCustomerSatisfactionResultEmail
    ,customer_issue_confirmation: sendCustomerSatisfactionResultEmail
    ,staff_completion_alert: sendStaffCloseoutEmail
    ,staff_satisfaction_alert: sendStaffCloseoutEmail
    ,staff_closeout_issue_alert: sendStaffCloseoutEmail
    ,staff_closeout_issue_resolved: sendStaffCloseoutEmail
    ,customer_closeout_review: sendCustomerCompletionSatisfactionEmail
    ,customer_closeout_followup: sendCustomerCompletionSatisfactionEmail
    ,customer_closeout_confirmation: sendCustomerSatisfactionResultEmail
    ,customer_closeout_issue_confirmation: sendCustomerSatisfactionResultEmail
    ,customer_closeout_issue_resolved: sendCustomerCompletionSatisfactionEmail
    ,customer_payment_proof_received: sendCustomerPaymentProofEmail
    ,staff_payment_proof_alert: sendStaffPaymentProofEmail
    ,customer_payment_proof_verified: sendCustomerPaymentProofEmail
    ,customer_payment_proof_rejected: sendCustomerPaymentProofEmail
  };
  const sender = senders[message.type];
  if (!sender) throw new Error(`Unsupported email outbox type: ${message.type}`);
  try {
    const payload = { ...message.payload };
    if (payload.encryptedCompletionToken) {
      payload.completionToken = decryptCloseoutToken(payload.encryptedCompletionToken);
      delete payload.encryptedCompletionToken;
    }
    if (payload.encryptedSatisfactionToken) {
      payload.satisfactionToken = decryptCloseoutToken(payload.encryptedSatisfactionToken);
      delete payload.encryptedSatisfactionToken;
    }
    if (payload.encryptedToken) {
      payload.token = message.type === 'website_customer_confirmation' ? decryptIntakeToken(payload.encryptedToken) : message.type === 'vendor_schedule_proposal' ? decryptScheduleToken(payload.encryptedToken) : OUTGOING_TOKEN_TYPES.has(message.type) ? decryptOutgoingToken(payload.encryptedToken) : decryptToken(payload.encryptedToken);
      delete payload.encryptedToken;
    }
    if (message.type === 'website_customer_confirmation' && payload.token) {
      const activeIntake = await IntakeSubmission.exists({
        _id: message.intakeSubmissionId,
        completionTokenHash: hashIntakeToken(payload.token),
        completionStatus: 'pending',
        completionTokenExpiresAt: { $gt: new Date() }
      });
      if (!activeIntake) {
        await EmailOutbox.updateOne({ _id: message._id, lockedBy: WORKER_ID }, { $set: { status: 'cancelled', lockedUntil: null, lockedBy: null, lastErrorCategory: 'completion_link_inactive' } });
        return;
      }
    }
    if (message.type === 'vendor_schedule_proposal') {
      const activeSchedule = await JobSchedule.exists({ _id: message.jobScheduleId, publicTokenHash: hashScheduleToken(payload.token), status: 'pending_vendor', tokenExpiresAt: { $gt: new Date() } });
      if (!activeSchedule) { await EmailOutbox.updateOne({ _id: message._id, lockedBy: WORKER_ID }, { $set: { status: 'cancelled', lockedUntil: null, lockedBy: null, lastErrorCategory: 'schedule_link_inactive' } }); return; }
    }
    if (message.type === 'vendor_schedule_accepted_confirmation' && message.vendorWorkOrderId) {
      const workOrder = await VendorWorkOrder.findById(message.vendorWorkOrderId).lean();
      if (!workOrder) throw new Error('Vendor work order is missing');
      const pdf = await createVendorWorkOrderPdf(workOrder);
      payload.attachments = [{ filename: `${workOrder.workOrderReference}.pdf`, content: pdf }];
      payload.decision = 'accepted';
    }
    if (message.type === 'vendor_completion_link') {
      const active = await JobCompletion.exists({ _id: message.jobCompletionId, publicTokenHash: hashCloseoutToken(payload.completionToken), status: 'pending', tokenExpiresAt: { $gt: new Date() } });
      if (!active) { await EmailOutbox.updateOne({ _id: message._id, lockedBy: WORKER_ID }, { $set: { status: 'cancelled', lockedUntil: null, lockedBy: null, lastErrorCategory: 'completion_link_inactive' } }); return; }
    }
    if (['customer_completion_satisfaction', 'customer_satisfaction_followup','customer_closeout_review','customer_closeout_followup','customer_closeout_issue_resolved'].includes(message.type)) {
      const completion = await JobCompletion.findOne({ _id: message.jobCompletionId, satisfactionTokenHash: hashCloseoutToken(payload.satisfactionToken), status: 'completed', satisfactionTokenExpiresAt: { $gt: new Date() }, closeoutTokenRevokedAt: { $exists: false } }).lean();
      const active = Boolean(completion);
      const decided = completion ? await CustomerSatisfactionDecision.exists({ jobCompletionId: message.jobCompletionId, closeoutRevision: completion.closeoutRevision }) : false;
      if (!active || decided) { await EmailOutbox.updateOne({ _id: message._id, lockedBy: WORKER_ID }, { $set: { status: 'cancelled', lockedUntil: null, lockedBy: null, lastErrorCategory: decided ? 'satisfaction_already_recorded' : 'satisfaction_link_inactive' } }); return; }
      if (['customer_satisfaction_followup','customer_closeout_followup'].includes(message.type)) payload.followup = true;
    }
    if (['customer_completion_satisfaction','customer_closeout_review','customer_closeout_issue_resolved'].includes(message.type) && message.customerInvoiceId) {
      const invoice = await CustomerInvoice.findById(message.customerInvoiceId).lean();
      if (!invoice) throw new Error('Customer invoice is missing');
      payload.attachments = [{ filename: `${invoice.invoiceNumber}.pdf`, content: await createCustomerInvoicePdf(invoice) }];
      const completion=await JobCompletion.findById(message.jobCompletionId).lean();
      try {
        const previews=await Promise.all([
          evidencePreviewAttachment(completion?.beforePhotos?.[0],'before-evidence','before-service'),
          evidencePreviewAttachment(completion?.afterPhotos?.[0],'after-evidence','after-service')
        ]);
        payload.attachments.push(...previews.filter(Boolean));
      } catch (previewError) {
        console.warn('Closeout email preview generation skipped:', previewError.message);
      }
      await CustomerInvoice.updateOne({ _id: invoice._id }, { $set: { pdfGeneratedAt: new Date() } });
    }
    if (message.type === 'customer_closeout_issue_resolved') payload.resolutionNote = payload.resolutionNote || 'The reported service issue was addressed.';
    if (message.type === 'customer_payment_proof_received') payload.status = 'received';
    if (message.type === 'customer_payment_proof_verified') payload.status = 'verified';
    if (message.type === 'customer_payment_proof_rejected') payload.status = 'rejected';
    if (message.type === 'vendor_schedule_change_confirmation') payload.decision = 'changes_requested';
    if (message.type === 'staff_schedule_accepted_alert') payload.decision = 'accepted';
    if (message.type === 'staff_schedule_change_alert') payload.decision = 'changes_requested';
    if (OUTGOING_TOKEN_TYPES.has(message.type)) {
      const activeQuote = await OutgoingQuote.findOne({
        _id: message.outgoingQuoteId,
        publicTokenHash: hashOutgoingToken(payload.token),
        status: 'sent',
        validUntil: { $gt: new Date() }
      }).select('_id').lean();
      if (!activeQuote) {
        await EmailOutbox.updateOne({ _id: message._id, lockedBy: WORKER_ID }, { $set: { status: 'cancelled', lockedUntil: null, lockedBy: null, lastErrorCategory: 'quote_link_inactive' } });
        return;
      }
    }
    if (['vendor_quote_invitation', 'vendor_quote_revision_request'].includes(message.type)) {
      const validInvitation = await QuoteInvitation.exists({
        _id: message.quoteInvitationId,
        tokenHash: hashToken(payload.token),
        status: { $in: ['sent', 'delivery_failed'] },
        expiresAt: { $gt: new Date() }
      });
      if (!validInvitation) {
        await EmailOutbox.updateOne({ _id: message._id, lockedBy: WORKER_ID }, { $set: { status: 'cancelled', lockedUntil: null, lockedBy: null, lastErrorCategory: 'invitation_inactive' } });
        return;
      }
    }
    if (message.type === 'vendor_quote_revision_request') payload.revision = true;
    const result = await sender({ recipients: message.recipients, ...payload });
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
    const delivery = { status: 'sent', attempts: message.attempts, lastAttemptAt: now, sentAt: now, lastErrorCategory: null, provider: result?.provider, providerMessageId: result?.messageId };
    await markIntakeDelivery(message, delivery);
    await markQuoteDelivery(message, delivery);
    if (['customer_satisfaction_followup','customer_closeout_followup'].includes(message.type)) await Order.updateOne({ _id: message.orderId }, { $set: { satisfactionFollowupSentAt: now } });
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
    await markQuoteDelivery(message, { status: permanent ? 'permanently_failed' : 'retry_scheduled', lastErrorCategory: category });
    if (permanent) await alertPermanentFailure(message, category);
    console.warn(`Email ${message.type} failed for ${message.payload.requestReference || message.payload.quoteReference}: ${category}`);
  }
}

async function pollOnce() {
  if (polling) return;
  polling = true;
  try {
    await cleanupCloseoutOrphans();
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
  _test: { errorCategory, cleanupCloseoutOrphans }
};
