const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { GridFSBucket, ObjectId } = require('mongodb');
const VendorInvitation = require('../models/VendorInvitation');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Notification = require('../models/Notification');
const SecurityAuditEvent = require('../models/SecurityAuditEvent');
const authenticateToken = require('../middleware/auth');
const checkRole = require('../middleware/rbac');
const { encryptTaxId, decryptTaxId } = require('../utils/taxIdCrypto');
const {
  getEmailDeliveryStatus,
  sendVendorInvitationEmail,
  sendVendorSubmissionReceivedEmail,
  sendVendorDecisionEmail,
  sendStaffVendorSubmissionEmail,
  sendStaffVendorReviewUpdateEmail
} = require('../utils/emailService');
const { buildPublicUrl } = require('../utils/publicAppUrl');
const { invalidateDashboardStatsCache } = require('../utils/dashboardStatsCache');

const router = express.Router();
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FILE_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES || `${50 * 1024 * 1024}`, 10);
const MAX_BATCH_BYTES = parseInt(process.env.MAX_ATTACHMENT_BATCH_BYTES || `${MAX_FILE_BYTES * 10}`, 10);
const MAX_FILE_LABEL = `${Math.round((MAX_FILE_BYTES / 1024 / 1024) * 100) / 100} MB`;
const ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'txt', 'jpg', 'jpeg', 'png']);
const MIME_TYPES = {
  pdf: ['application/pdf', 'application/octet-stream'],
  doc: ['application/msword', 'application/octet-stream'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/octet-stream'],
  txt: ['text/plain', 'application/octet-stream'],
  jpg: ['image/jpeg'], jpeg: ['image/jpeg'], png: ['image/png']
};
const DOCUMENT_FIELDS = [
  { name: 'huttasContract', maxCount: 1 },
  { name: 'w9', maxCount: 1 },
  { name: 'certificateOfInsurance', maxCount: 1 },
  { name: 'workersCompInsurance', maxCount: 1 },
  { name: 'huttasAdditionalInsured', maxCount: 1 },
  { name: 'generalDocuments', maxCount: 5 }
];
const COMPLIANCE_LABELS = {
  huttasContract: 'Huttas Contract with Sub (Signed and Dated)',
  w9: 'W-9 on File (Signed and Dated)',
  certificateOfInsurance: 'Certificate of Insurance on File',
  workersCompInsurance: 'Workers Comp Insurance on File',
  huttasAdditionalInsured: 'Huttas Listed as Additional Insured on GL Policy'
};
const CATEGORY_COMPLIANCE_RULES = {
  default: Object.keys(COMPLIANCE_LABELS)
};
const REVIEW_STATUSES = ['pending_review', 'changes_requested', 'rejected'];
const INVITATION_STATUSES = ['sent', 'delivery_failed', 'processing', 'submitted', 'revoked', 'expired'];

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many onboarding requests. Please try again later.' }
});
const tokenAttempts = new Map();

function tokenLimiter(req, res, next) {
  const token = req.get('x-vendor-invite-token') || '';
  const key = hashToken(token).slice(0, 24);
  const now = Date.now();
  const current = tokenAttempts.get(key);
  if (tokenAttempts.size > 5000) {
    for (const [attemptKey, attempt] of tokenAttempts) {
      if (attempt.resetAt <= now) tokenAttempts.delete(attemptKey);
    }
  }
  if (!current || current.resetAt <= now) {
    tokenAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return next();
  }
  current.count += 1;
  if (current.count > 80) return res.status(429).json({ message: 'Too many attempts for this invitation. Please try again later.' });
  next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 10 },
  fileFilter: (_req, file, callback) => {
    const extension = extensionOf(file.originalname);
    const valid = ALLOWED_EXTENSIONS.has(extension) && (MIME_TYPES[extension] || []).includes(file.mimetype);
    callback(valid ? null : new Error('File extension and MIME type are not allowed'), valid);
  }
}).fields(DOCUMENT_FIELDS);

function extensionOf(name) {
  return String(name || '').split('.').pop().toLowerCase();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}

function cleanText(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function mergeEmails(...groups) {
  return [...new Set(groups.flat().map(normalizeEmail).filter(isValidEmail))];
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function requiredComplianceEntries(category) {
  const key = String(category || '').trim().toLowerCase();
  const requiredTypes = CATEGORY_COMPLIANCE_RULES[key] || CATEGORY_COMPLIANCE_RULES.default;
  return requiredTypes
    .filter(type => COMPLIANCE_LABELS[type])
    .map(type => [type, COMPLIANCE_LABELS[type]]);
}

function missingComplianceDocuments(vendor) {
  const source = vendor?.toObject ? vendor.toObject({ virtuals: true }) : (vendor || {});
  const activeTypes = new Set((source.documents || [])
    .filter(document => document.status !== 'archived')
    .map(document => document.complianceDocumentType));
  return requiredComplianceEntries(source.category)
    .filter(([type]) => !activeTypes.has(type))
    .map(([type, label]) => ({ type, label }));
}

function normalizeComparable(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function duplicateReason(source, match) {
  const reasons = [];
  const sourceEmail = normalizeEmail(source.email);
  if (sourceEmail && [normalizeEmail(match.email), ...(match.emails || []).map(item => normalizeEmail(item.address))].includes(sourceEmail)) {
    reasons.push('email match');
  }
  const sourceCompany = normalizeComparable(source.name || source.companyName);
  const matchNames = [match.name, match.legalBusinessName].map(normalizeComparable).filter(Boolean);
  if (sourceCompany && matchNames.includes(sourceCompany)) reasons.push('company name match');
  const sourceLegal = normalizeComparable(source.legalBusinessName);
  if (sourceLegal && matchNames.includes(sourceLegal)) reasons.push('legal name match');
  const sourcePhone = digitsOnly(source.phone);
  const matchPhones = [match.phone, ...(match.phones || []).map(item => item.number)].map(digitsOnly).filter(Boolean);
  if (sourcePhone && sourcePhone.length >= 7 && matchPhones.includes(sourcePhone)) reasons.push('phone match');
  const sourceLicense = normalizeComparable(source.rocLicenseNumber);
  if (sourceLicense && normalizeComparable(match.rocLicenseNumber) === sourceLicense) reasons.push('ROC license match');
  const sourceTaxLast4 = digitsOnly(source.einTaxIdLast4).slice(-4);
  if (sourceTaxLast4 && sourceTaxLast4.length === 4 && digitsOnly(match.einTaxIdLast4).slice(-4) === sourceTaxLast4) reasons.push('Tax ID last-four match');
  return reasons;
}

async function findDuplicateVendorWarnings(source = {}, options = {}) {
  const or = [];
  const email = normalizeEmail(source.email);
  const companyName = cleanText(source.name || source.companyName, 160);
  const legalBusinessName = cleanText(source.legalBusinessName, 200);
  const phoneDigits = digitsOnly(source.phone);
  const rocLicenseNumber = cleanText(source.rocLicenseNumber, 100);
  const taxLast4 = digitsOnly(source.einTaxIdLast4).slice(-4);

  if (email) or.push({ email }, { 'emails.address': email });
  if (companyName.length >= 3) {
    const companyPattern = new RegExp(`^${escapeRegex(companyName)}$`, 'i');
    or.push({ name: companyPattern }, { legalBusinessName: companyPattern });
  }
  if (legalBusinessName.length >= 3) {
    const legalPattern = new RegExp(`^${escapeRegex(legalBusinessName)}$`, 'i');
    or.push({ name: legalPattern }, { legalBusinessName: legalPattern });
  }
  if (phoneDigits.length >= 7) or.push({ phone: source.phone }, { 'phones.number': source.phone });
  if (rocLicenseNumber) or.push({ rocLicenseNumber: new RegExp(`^${escapeRegex(rocLicenseNumber)}$`, 'i') });
  if (taxLast4.length === 4) or.push({ einTaxIdLast4: taxLast4 });
  if (!or.length) return [];

  const query = { $or: or };
  if (options.excludeId) query._id = { $ne: options.excludeId };
  const matches = await Vendor.find(query)
    .select('_id name email emails phone phones legalBusinessName category onboardingStatus isActive rocLicenseNumber einTaxIdLast4')
    .limit(8)
    .lean();

  return matches.map(match => ({
    vendorId: match._id,
    vendorName: match.name || match.legalBusinessName || match.email || 'Existing vendor',
    email: match.email,
    category: match.category,
    onboardingStatus: match.onboardingStatus,
    isActive: match.isActive,
    reasons: duplicateReason(source, match)
  })).filter(item => item.reasons.length);
}

async function findInvitationDuplicateWarnings({ email, companyName }) {
  const vendorWarnings = await findDuplicateVendorWarnings({ email, companyName });
  const inviteOr = [];
  if (companyName && companyName.length >= 3) {
    inviteOr.push({ companyName: new RegExp(`^${escapeRegex(companyName)}$`, 'i') });
  }
  const invitationWarnings = inviteOr.length ? await VendorInvitation.find({
    $or: inviteOr,
    status: { $in: ['sent', 'delivery_failed', 'processing'] },
    expiresAt: { $gt: new Date() }
  }).select('_id email companyName category status expiresAt').limit(5).lean() : [];

  return [
    ...vendorWarnings.map(item => ({ type: 'vendor', ...item })),
    ...invitationWarnings.map(item => ({
      type: 'invitation',
      invitationId: item._id,
      vendorName: item.companyName || item.email,
      email: item.email,
      category: item.category,
      status: item.status,
      reasons: ['active invitation for a similar company name']
    }))
  ];
}

function reviewPayload(vendor, invitations = []) {
  const source = vendor.toObject ? vendor.toObject({ virtuals: true }) : { ...vendor };
  return {
    ...source,
    einTaxIdMasked: source.einTaxIdLast4 ? `***-**-${source.einTaxIdLast4}` : '',
    requiredDocuments: requiredComplianceEntries(source.category).map(([type, label]) => ({ type, label })),
    missingDocuments: missingComplianceDocuments(source),
    invitationHistory: invitations.map(safeInvitation)
  };
}

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function onboardingUrl(token) {
  return buildPublicUrl('/pages/vendor-onboarding.html', `token=${encodeURIComponent(token)}`);
}

function userId(req) {
  return req.user?.userId || req.user?.id;
}

function safeInvitation(invitation) {
  const source = invitation.toObject ? invitation.toObject() : invitation;
  delete source.tokenHash;
  return {
    ...source,
    displayStatus: ['sent', 'delivery_failed'].includes(source.status) && new Date(source.expiresAt) <= new Date() ? 'expired' : source.status
  };
}

function validFileSignature(file) {
  const ext = extensionOf(file.originalname);
  const data = file.buffer || Buffer.alloc(0);
  if (ext === 'pdf') return data.subarray(0, 5).toString() === '%PDF-';
  if (ext === 'png') return data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (ext === 'jpg' || ext === 'jpeg') return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (ext === 'doc') return data.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (ext === 'docx') return data[0] === 0x50 && data[1] === 0x4b;
  if (ext === 'txt') return !data.subarray(0, Math.min(data.length, 4096)).includes(0x00);
  return false;
}

function allFiles(req) {
  return Object.values(req.files || {}).flat();
}

function parseList(value, mapper, maxItems = 5) {
  if (!value) return [];
  try {
    const list = JSON.parse(value);
    if (!Array.isArray(list)) return [];
    return list.slice(0, maxItems).map(mapper).filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function getBucket() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return null;
  return new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
}

function storeFile(file, metadata) {
  return new Promise((resolve, reject) => {
    const bucket = getBucket();
    if (!bucket) return reject(new Error('File storage is not ready'));
    const safeName = String(file.originalname || 'document').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120);
    const filename = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${safeName}`;
    const stream = bucket.openUploadStream(filename, { metadata });
    stream.once('error', reject);
    stream.once('finish', () => resolve({ fileId: stream.id, filename }));
    stream.end(file.buffer);
  });
}

function uploadMiddleware(req, res, next) {
  const contentLength = Number(req.get('content-length') || 0);
  if (contentLength && contentLength > MAX_BATCH_BYTES + (1024 * 1024)) {
    return res.status(413).json({ message: 'Document batch exceeds the maximum total size' });
  }
  upload(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: `A document exceeds the ${MAX_FILE_LABEL} file limit` });
    return res.status(400).json({ message: error.message || 'Document upload failed' });
  });
}

async function findPublicInvitation(req, res, next) {
  try {
    const token = req.get('x-vendor-invite-token');
    if (!token || token.length < 32 || token.length > 100) return res.status(401).json({ message: 'A valid invitation token is required' });
    const tokenHash = hashToken(token);
    await VendorInvitation.updateOne({
      tokenHash,
      status: 'processing',
      processingStartedAt: { $lt: new Date(Date.now() - 15 * 60 * 1000) }
    }, { $set: { status: 'sent' }, $unset: { processingStartedAt: '' } });
    const invitation = await VendorInvitation.findOne({
      tokenHash,
      status: { $in: ['sent', 'delivery_failed'] },
      expiresAt: { $gt: new Date() }
    }).select('+tokenHash');
    if (!invitation) return res.status(410).json({ message: 'This invitation is invalid, expired, revoked, or already used' });
    req.vendorInvitation = invitation;
    req.vendorInviteToken = token;
    next();
  } catch (error) {
    next(error);
  }
}

async function createNotifications(invitation, vendor) {
  const reviewers = await User.find({ role: { $in: ['admin', 'manager'] }, isActive: true }).select('_id email').lean();
  const recipients = new Map(reviewers.map(user => [String(user._id), user]));
  if (invitation.invitedBy) {
    const inviter = await User.findById(invitation.invitedBy).select('_id email').lean();
    if (inviter) recipients.set(String(inviter._id), inviter);
  }
  const users = [...recipients.values()];
  await Notification.insertMany(users.map(user => ({
    userId: user._id,
    title: 'Vendor application submitted',
    message: `${vendor.name} submitted a vendor application for review.`,
    type: 'success',
    priority: 'high',
    actionUrl: '/pages/admin-dashboard.html#vendor-reviews',
    metadata: { vendorId: vendor._id, invitationId: invitation._id }
  })));
  return mergeEmails(users.map(user => user.email), [invitation.updateRecipientEmail]);
}

async function notifyUpdateRecipient(invitation, details) {
  const email = normalizeEmail(invitation?.updateRecipientEmail);
  if (!isValidEmail(email)) return;
  try {
    await sendStaffVendorReviewUpdateEmail({
      emails: [email],
      companyName: details.companyName,
      vendorId: details.vendorId,
      vendorEmail: details.vendorEmail,
      action: details.action,
      message: details.message,
      deliveryError: details.deliveryError
    });
    invitation.updateRecipientNotificationError = undefined;
    if (details.vendorId) {
      await Vendor.updateOne(
        { _id: details.vendorId },
        { $unset: { updateRecipientNotificationError: '' } }
      ).catch(() => {});
    }
  } catch (error) {
    invitation.updateRecipientNotificationError = cleanText(error.message, 500);
    if (details.vendorId) {
      await Vendor.updateOne(
        { _id: details.vendorId },
        { $set: { updateRecipientNotificationError: invitation.updateRecipientNotificationError } }
      ).catch(() => {});
    }
  }
  await invitation.save().catch(() => {});
}

async function sendInvitation(invitation, token) {
  try {
    const delivery = await sendVendorInvitationEmail({
      email: invitation.email,
      companyName: invitation.companyName,
      categoryLabel: invitation.categoryLabel || invitation.category,
      token,
      expiresAt: invitation.expiresAt,
      personalMessage: invitation.personalMessage,
      purpose: invitation.purpose
    });
    invitation.status = 'sent';
    invitation.sentAt = new Date();
    invitation.lastDeliveryError = undefined;
    invitation.lastDeliveryProvider = delivery.provider;
    invitation.lastDeliveryMessageId = delivery.messageId || undefined;
  } catch (error) {
    invitation.status = 'delivery_failed';
    invitation.lastDeliveryError = cleanText(error.message, 500);
    invitation.lastDeliveryMessageId = undefined;
  }
  await invitation.save();
  if (invitation.status === 'delivery_failed') {
    await notifyUpdateRecipient(invitation, {
      action: 'invitation_delivery_failed',
      companyName: invitation.companyName,
      vendorId: invitation.vendor ? String(invitation.vendor) : '',
      vendorEmail: invitation.email,
      deliveryError: invitation.lastDeliveryError || 'Vendor invitation email delivery failed.'
    });
  }
}

// Public form endpoints. Token is supplied only through a request header.
router.get('/public/form', publicLimiter, tokenLimiter, findPublicInvitation, async (req, res, next) => {
  try {
    let vendor = null;
    if (req.vendorInvitation.vendor) vendor = await Vendor.findById(req.vendorInvitation.vendor).lean();
    const invitation = req.vendorInvitation;
    res.set('Cache-Control', 'no-store');
    res.json({
      email: invitation.email,
      companyName: vendor?.name || invitation.companyName || '',
      category: invitation.category,
      categoryLabel: invitation.categoryLabel || invitation.category,
      purpose: invitation.purpose,
      expiresAt: invitation.expiresAt,
      vendor: vendor ? {
        name: vendor.name,
        phone: vendor.phone,
        address: vendor.address,
        addresses: vendor.addresses,
        emails: vendor.emails,
        phones: vendor.phones,
        legalBusinessName: vendor.legalBusinessName,
        businessEntityType: vendor.businessEntityType,
        primaryOwnerName: vendor.primaryOwnerName,
        businessAddress: vendor.businessAddress,
        einTaxIdMasked: vendor.einTaxIdLast4 ? `***-**-${vendor.einTaxIdLast4}` : '',
        contractorLicenseNumber: vendor.contractorLicenseNumber,
        rocLicenseNumber: vendor.rocLicenseNumber,
        rocLicenseTypeClassification: vendor.rocLicenseTypeClassification,
        rocLicenseExpirationDate: vendor.rocLicenseExpirationDate,
        insuranceExpirationDate: vendor.insuranceExpirationDate,
        requestedCategory: vendor.requestedCategory,
        documents: (vendor.documents || []).map(document => ({
          documentId: document.documentId,
          name: document.name,
          complianceDocumentType: document.complianceDocumentType,
          status: document.status
        }))
      } : null
    });
  } catch (error) {
    next(error);
  }
});

router.post('/public/form', publicLimiter, tokenLimiter, findPublicInvitation, uploadMiddleware, async (req, res, next) => {
  let claimedInvitation;
  let vendor;
  try {
    if (req.body.website) return res.status(400).json({ message: 'Submission rejected' });
    const name = cleanText(req.body.name, 160);
    if (!name) return res.status(400).json({ message: 'Company name is required' });
    if (String(req.body.accuracyAccepted) !== 'true') return res.status(400).json({ message: 'Accuracy and authorization acknowledgement is required' });
    if (String(req.body.categoryConfirmed) !== 'true') return res.status(400).json({ message: 'Please confirm the assigned service category' });
    const allowedEntityTypes = new Set(['', 'LLC', 'Sole Proprietor', 'Corporation', 'Partnership', 'Other']);
    if (!allowedEntityTypes.has(String(req.body.businessEntityType || ''))) return res.status(400).json({ message: 'Invalid business entity type' });
    if (req.body.rocLicenseExpirationDate && Number.isNaN(Date.parse(req.body.rocLicenseExpirationDate))) {
      return res.status(400).json({ message: 'Invalid ROC license expiration date' });
    }
    if (req.body.insuranceExpirationDate && Number.isNaN(Date.parse(req.body.insuranceExpirationDate))) {
      return res.status(400).json({ message: 'Invalid insurance expiration date' });
    }

    const files = allFiles(req);
    if (files.reduce((sum, file) => sum + Number(file.size || 0), 0) > MAX_BATCH_BYTES) {
      return res.status(413).json({ message: 'Document batch exceeds the maximum total size' });
    }
    const invalidFile = files.find(file => !validFileSignature(file));
    if (invalidFile) return res.status(400).json({ message: `${invalidFile.originalname} does not match its declared file type` });

    claimedInvitation = await VendorInvitation.findOneAndUpdate({
      _id: req.vendorInvitation._id,
      tokenHash: req.vendorInvitation.tokenHash,
      status: { $in: ['sent', 'delivery_failed'] },
      expiresAt: { $gt: new Date() }
    }, { $set: { status: 'processing', processingStartedAt: new Date(), submissionError: null } }, { new: true }).select('+tokenHash');
    if (!claimedInvitation) return res.status(409).json({ message: 'This invitation is already being processed or has been used' });

    const emails = parseList(req.body.additionalEmails, item => {
      const address = normalizeEmail(item?.address || item);
      return address && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? { label: cleanText(item?.label || 'Additional', 40), address, isPrimary: false } : null;
    });
    const phones = parseList(req.body.additionalPhones, item => {
      const number = cleanText(item?.number || item, 40);
      return number ? { label: cleanText(item?.label || 'Additional', 40), number, isPrimary: false } : null;
    });
    const addresses = parseList(req.body.additionalAddresses, item => {
      const address = cleanText(item?.address || item, 500);
      return address ? { label: cleanText(item?.label || 'Additional', 40), address, isPrimary: false } : null;
    });
    const phone = cleanText(req.body.phone, 40);
    const address = cleanText(req.body.address, 500);
    const taxId = cleanText(req.body.einTaxId, 40);
    const taxPayload = taxId && !taxId.includes('*') ? encryptTaxId(taxId) : null;
    const vendorData = {
      name,
      email: claimedInvitation.email,
      phone,
      address,
      category: claimedInvitation.category,
      requestedCategory: cleanText(req.body.requestedCategory, 100),
      legalBusinessName: cleanText(req.body.legalBusinessName, 200),
      businessEntityType: cleanText(req.body.businessEntityType, 80),
      primaryOwnerName: cleanText(req.body.primaryOwnerName, 160),
      businessAddress: cleanText(req.body.businessAddress, 500),
      contractorLicenseNumber: cleanText(req.body.contractorLicenseNumber, 100),
      rocLicenseNumber: cleanText(req.body.rocLicenseNumber, 100),
      rocLicenseTypeClassification: cleanText(req.body.rocLicenseTypeClassification, 160),
      rocLicenseExpirationDate: req.body.rocLicenseExpirationDate || null,
      insuranceExpirationDate: req.body.insuranceExpirationDate || null,
      emails: [{ label: 'Primary', address: claimedInvitation.email, isPrimary: true }, ...emails.filter(item => item.address !== claimedInvitation.email)],
      phones: phone ? [{ label: 'Primary', number: phone, isPrimary: true }, ...phones] : phones,
      addresses: address ? [{ label: 'Primary', address, isPrimary: true }, ...addresses] : addresses,
      onboardingSource: 'invitation',
      onboardingStatus: 'pending_review',
      isActive: false,
      submittedAt: new Date()
    };
    if (taxPayload) {
      vendorData.einTaxIdEncrypted = taxPayload.encrypted;
      vendorData.einTaxIdIv = taxPayload.iv;
      vendorData.einTaxIdTag = taxPayload.tag;
      vendorData.einTaxIdLast4 = taxPayload.last4;
    }

    if (claimedInvitation.vendor) {
      vendor = await Vendor.findById(claimedInvitation.vendor);
      if (!vendor) throw new Error('The vendor application linked to this invitation is unavailable');
      const wasChangesRequested = vendor.onboardingStatus === 'changes_requested';
      Object.entries(vendorData).forEach(([key, value]) => vendor.set(key, value));
      vendor.reviewedAt = undefined;
      vendor.reviewedBy = undefined;
      vendor.reviewMessage = undefined;
      vendor.onboardingEmailStatus = undefined;
      vendor.onboardingEmailError = undefined;
      vendor.onboardingHistory.push({ action: wasChangesRequested ? 'resubmitted' : 'submitted', message: 'Vendor submitted onboarding form', createdAt: new Date() });
    } else {
      const duplicate = await Vendor.findOne({ $or: [{ email: claimedInvitation.email }, { 'emails.address': claimedInvitation.email }] }).select('_id');
      if (duplicate) throw Object.assign(new Error('A vendor with this email already exists'), { statusCode: 409 });
      vendor = new Vendor({
        ...vendorData,
        invitationId: claimedInvitation._id,
        rating: 5,
        onboardingHistory: [{ action: 'submitted', message: 'Vendor submitted onboarding form', createdAt: new Date() }]
      });
    }
    await vendor.save();

    const uploadedDocuments = [];
    for (const [fieldName, fieldFiles] of Object.entries(req.files || {})) {
      for (const file of fieldFiles) {
        const documentId = crypto.randomUUID();
        const complianceType = fieldName === 'generalDocuments' ? undefined : fieldName;
        const stored = await storeFile(file, {
          documentId,
          entityType: 'vendor',
          entityId: String(vendor._id),
          invitationId: String(claimedInvitation._id),
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          uploadedAt: new Date(),
          linkStatus: 'quarantined',
          source: 'vendor-onboarding'
        });
        if (complianceType) {
          (vendor.documents || []).forEach(existing => {
            if (existing.complianceDocumentType === complianceType && existing.status !== 'archived') {
              existing.status = 'archived';
              existing.archivedAt = new Date();
              existing.archiveReason = 'Superseded by vendor onboarding submission';
            }
          });
        }
        const document = {
          documentId,
          name: file.originalname,
          url: `/api/attachments/vendor/${vendor._id}/${documentId}`,
          type: file.mimetype,
          size: file.size,
          storageProvider: 'gridfs',
          fileId: stored.fileId,
          uploadedAt: new Date(),
          uploadedByEmail: claimedInvitation.email,
          status: 'active',
          complianceDocumentType: complianceType,
          complianceDocumentLabel: complianceType ? COMPLIANCE_LABELS[complianceType] : undefined
        };
        vendor.documents.push(document);
        uploadedDocuments.push(document);
      }
    }
    await vendor.save();

    if (uploadedDocuments.length) {
      await mongoose.connection.db.collection('uploads.files').updateMany(
        { _id: { $in: uploadedDocuments.map(document => new ObjectId(String(document.fileId))) } },
        { $set: { 'metadata.linkStatus': 'linked' } }
      );
    }

    claimedInvitation.status = 'submitted';
    claimedInvitation.submittedAt = new Date();
    claimedInvitation.processingStartedAt = undefined;
    claimedInvitation.vendor = vendor._id;
    claimedInvitation.tokenHash = hashToken(crypto.randomBytes(32).toString('hex'));
    await claimedInvitation.save();
    invalidateDashboardStatsCache();

    let staffEmails = [];
    try {
      staffEmails = await createNotifications(claimedInvitation, vendor);
      claimedInvitation.staffNotificationError = undefined;
    } catch (notificationError) {
      claimedInvitation.staffNotificationError = cleanText(notificationError.message, 500);
    }
    const deliveryResults = await Promise.allSettled([
      sendVendorSubmissionReceivedEmail({ email: claimedInvitation.email, companyName: vendor.name }),
      sendStaffVendorSubmissionEmail({ emails: staffEmails, companyName: vendor.name, vendorId: String(vendor._id) })
    ]);
    claimedInvitation.confirmationDeliveryError = deliveryResults[0].status === 'rejected' ? cleanText(deliveryResults[0].reason?.message, 500) : undefined;
    if (deliveryResults[1].status === 'rejected') claimedInvitation.staffNotificationError = cleanText(deliveryResults[1].reason?.message, 500);
    if (claimedInvitation.confirmationDeliveryError) {
      await notifyUpdateRecipient(claimedInvitation, {
        action: 'confirmation_delivery_failed',
        companyName: vendor.name,
        vendorId: String(vendor._id),
        vendorEmail: claimedInvitation.email,
        deliveryError: claimedInvitation.confirmationDeliveryError
      });
    }
    await claimedInvitation.save();
    res.status(201).json({ message: 'Vendor application submitted successfully', vendorReference: String(vendor._id).slice(-8).toUpperCase() });
  } catch (error) {
    if (claimedInvitation) {
      if (vendor?._id) {
        claimedInvitation.status = 'submitted';
        claimedInvitation.vendor = vendor._id;
        claimedInvitation.submittedAt = new Date();
        claimedInvitation.processingStartedAt = undefined;
        claimedInvitation.submissionError = cleanText(error.message, 500);
      } else {
        claimedInvitation.status = 'sent';
        claimedInvitation.processingStartedAt = undefined;
        claimedInvitation.submissionError = cleanText(error.message, 500);
      }
      await claimedInvitation.save().catch(() => {});
    }
    if (vendor?._id) {
      const staffEmails = await createNotifications(claimedInvitation, vendor).catch(() => []);
      await Promise.allSettled([
        sendVendorSubmissionReceivedEmail({ email: claimedInvitation.email, companyName: vendor.name }),
        sendStaffVendorSubmissionEmail({ emails: staffEmails, companyName: vendor.name, vendorId: String(vendor._id) })
      ]);
      return res.status(202).json({
        message: 'Your application was received. Some uploaded documents require staff recovery, and our team has been notified.',
        vendorReference: String(vendor._id).slice(-8).toUpperCase(),
        warning: true
      });
    }
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    next(error);
  }
});

// Authenticated invitation administration.
router.use(authenticateToken, checkRole(['admin', 'manager']));

router.get('/email-status', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(getEmailDeliveryStatus());
});

router.get('/reviews', async (req, res, next) => {
  try {
    const requestedStatus = String(req.query.status || 'pending_review');
    if (requestedStatus !== 'all' && !REVIEW_STATUSES.includes(requestedStatus)) {
      return res.status(400).json({ message: 'Invalid review status' });
    }
    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10) || 25));
    const query = {
      onboardingSource: 'invitation',
      onboardingStatus: requestedStatus === 'all' ? { $in: REVIEW_STATUSES } : requestedStatus
    };
    const search = cleanText(req.query.search, 120);
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      query.$or = [
        { name: pattern }, { email: pattern }, { legalBusinessName: pattern },
        { category: pattern }, { requestedCategory: pattern }
      ];
    }

    const [vendors, total, counts] = await Promise.all([
      Vendor.find(query)
        .select('name email category requestedCategory submittedAt onboardingStatus documents onboardingEmailStatus onboardingEmailError createdAt')
        .sort({ submittedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit).limit(limit).lean(),
      Vendor.countDocuments(query),
      Promise.all(REVIEW_STATUSES.map(status => Vendor.countDocuments({ onboardingSource: 'invitation', onboardingStatus: status })))
    ]);

    const data = vendors.map(vendor => {
      const missingDocuments = missingComplianceDocuments(vendor);
      return {
        ...vendor,
        documents: undefined,
        missingDocumentCount: missingDocuments.length,
        requiredDocumentCount: requiredComplianceEntries(vendor.category).length
      };
    });
    res.set('Cache-Control', 'no-store');
    res.json({
      data,
      counts: Object.fromEntries(REVIEW_STATUSES.map((status, index) => [status, counts[index]])),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/reviews/:vendorId', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.vendorId)) return res.status(400).json({ message: 'Invalid vendor id' });
    const vendor = await Vendor.findOne({
      _id: req.params.vendorId,
      onboardingSource: 'invitation',
      onboardingStatus: { $in: REVIEW_STATUSES }
    }).populate('reviewedBy', 'firstName lastName email');
    if (!vendor) return res.status(404).json({ message: 'Vendor review not found or already approved' });
    const invitations = await VendorInvitation.find({ vendor: vendor._id })
      .populate('invitedBy', 'firstName lastName email')
      .sort({ createdAt: -1 }).lean();
    const payload = reviewPayload(vendor, invitations);
    payload.duplicateWarnings = await findDuplicateVendorWarnings(vendor, { excludeId: vendor._id });
    res.set('Cache-Control', 'no-store');
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.post('/invitations', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const updateRecipientEmail = normalizeEmail(req.body.updateRecipientEmail);
    const category = cleanText(req.body.category, 60).toLowerCase();
    if (!isValidEmail(email)) return res.status(400).json({ message: 'A valid vendor email is required' });
    if (updateRecipientEmail && !isValidEmail(updateRecipientEmail)) return res.status(400).json({ message: 'A valid update recipient email is required' });
    if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(category)) return res.status(400).json({ message: 'A valid vendor category is required' });
    const existingVendor = await Vendor.findOne({ $or: [{ email }, { 'emails.address': email }] }).select('_id name onboardingStatus');
    if (existingVendor) return res.status(409).json({ message: `A vendor with this email already exists (${existingVendor.name})`, vendorId: existingVendor._id });
    const existingInvite = await VendorInvitation.findOne({ email, status: { $in: ['sent', 'delivery_failed', 'processing'] }, expiresAt: { $gt: new Date() } });
    if (existingInvite) return res.status(409).json({ message: 'An active invitation already exists for this email', invitationId: existingInvite._id });
    const duplicateWarnings = await findInvitationDuplicateWarnings({ email, companyName: cleanText(req.body.companyName, 160) });

    const token = generateToken();
    const invitation = new VendorInvitation({
      tokenHash: hashToken(token),
      email,
      companyName: cleanText(req.body.companyName, 160),
      category,
      categoryLabel: cleanText(req.body.categoryLabel || category, 100),
      personalMessage: cleanText(req.body.personalMessage, 1000),
      updateRecipientEmail,
      invitedBy: userId(req),
      invitedByEmail: req.user.email,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      status: 'sent'
    });
    await invitation.save();
    await sendInvitation(invitation, token);
    res.status(201).json({ invitation: safeInvitation(invitation), inviteUrl: onboardingUrl(token), duplicateWarnings });
  } catch (error) {
    next(error);
  }
});

router.get('/invitations', async (req, res, next) => {
  try {
    const requestedStatus = String(req.query.status || 'all');
    if (requestedStatus !== 'all' && !INVITATION_STATUSES.includes(requestedStatus)) {
      return res.status(400).json({ message: 'Invalid invitation status' });
    }
    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10) || 25));
    const now = new Date();
    const query = { clearedAt: { $exists: false } };
    if (requestedStatus === 'expired') {
      query.status = { $in: ['sent', 'delivery_failed'] };
      query.expiresAt = { $lte: now };
    } else if (requestedStatus !== 'all') {
      query.status = requestedStatus;
      if (['sent', 'delivery_failed'].includes(requestedStatus)) query.expiresAt = { $gt: now };
    }
    const search = cleanText(req.query.search, 120);
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      query.$or = [
        { email: pattern },
        { companyName: pattern },
        { category: pattern },
        { categoryLabel: pattern },
        { updateRecipientEmail: pattern },
        { invitedByEmail: pattern }
      ];
    }
    const [invitations, total, counts] = await Promise.all([
      VendorInvitation.find(query)
        .populate('invitedBy', 'firstName lastName email')
        .populate('vendor', 'name onboardingStatus isActive')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      VendorInvitation.countDocuments(query),
      Promise.all([
        VendorInvitation.countDocuments({ clearedAt: { $exists: false }, status: 'sent', expiresAt: { $gt: now } }),
        VendorInvitation.countDocuments({ clearedAt: { $exists: false }, status: 'delivery_failed', expiresAt: { $gt: now } }),
        VendorInvitation.countDocuments({ clearedAt: { $exists: false }, status: 'processing' }),
        VendorInvitation.countDocuments({ clearedAt: { $exists: false }, status: 'submitted' }),
        VendorInvitation.countDocuments({ clearedAt: { $exists: false }, status: 'revoked' }),
        VendorInvitation.countDocuments({ clearedAt: { $exists: false }, status: { $in: ['sent', 'delivery_failed'] }, expiresAt: { $lte: now } })
      ])
    ]);
    res.set('Cache-Control', 'no-store');
    res.json({
      data: invitations.map(safeInvitation),
      counts: {
        sent: counts[0],
        delivery_failed: counts[1],
        processing: counts[2],
        submitted: counts[3],
        revoked: counts[4],
        expired: counts[5]
      },
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/invitations/clear', async (req, res, next) => {
  try {
    const mode = String(req.body.mode || 'current');
    const requestedStatus = String(req.body.status || 'all');
    if (mode === 'current' && requestedStatus !== 'all' && !INVITATION_STATUSES.includes(requestedStatus)) {
      return res.status(400).json({ message: 'Invalid invitation status' });
    }

    const now = new Date();
    const query = { clearedAt: { $exists: false } };

    if (mode === 'active') {
      query.$or = [
        { status: 'processing' },
        { status: { $in: ['sent', 'delivery_failed'] }, expiresAt: { $gt: now } }
      ];
    } else if (mode === 'delivery_failed') {
      query.status = 'delivery_failed';
      query.expiresAt = { $gt: now };
    } else if (mode === 'expired') {
      query.status = { $in: ['sent', 'delivery_failed'] };
      query.expiresAt = { $lte: now };
    } else if (mode === 'current') {
      if (requestedStatus === 'expired') {
        query.status = { $in: ['sent', 'delivery_failed'] };
        query.expiresAt = { $lte: now };
      } else if (requestedStatus !== 'all') {
        query.status = requestedStatus;
        if (['sent', 'delivery_failed'].includes(requestedStatus)) query.expiresAt = { $gt: now };
      }
    } else if (mode !== 'all') {
      return res.status(400).json({ message: 'Invalid clear option' });
    }

    const search = cleanText(req.body.search, 120);
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { email: pattern },
            { companyName: pattern },
            { category: pattern },
            { categoryLabel: pattern },
            { updateRecipientEmail: pattern },
            { invitedByEmail: pattern }
          ]
        }
      ];
    }

    const matchedInvitations = await VendorInvitation.find(query).select('_id status').lean();
    const matched = matchedInvitations.length;
    const clearDate = new Date();
    const actorId = userId(req);
    const finalIds = matchedInvitations
      .filter(invitation => ['submitted', 'revoked'].includes(invitation.status))
      .map(invitation => invitation._id);
    const activeIds = matchedInvitations
      .filter(invitation => !['submitted', 'revoked'].includes(invitation.status))
      .map(invitation => invitation._id);
    let modifiedCount = 0;
    if (finalIds.length) {
      const result = await VendorInvitation.updateMany(
        { _id: { $in: finalIds } },
        { $set: { clearedAt: clearDate, clearedBy: actorId } }
      );
      modifiedCount += result.modifiedCount || 0;
    }
    if (activeIds.length) {
      const result = await VendorInvitation.updateMany(
        { _id: { $in: activeIds } },
        { $set: { clearedAt: clearDate, clearedBy: actorId, status: 'revoked', revokedAt: clearDate, revokedBy: actorId } }
      );
      modifiedCount += result.modifiedCount || 0;
    }

    res.json({
      matched,
      revoked: modifiedCount,
      cleared: modifiedCount,
      mode
    });
  } catch (error) {
    next(error);
  }
});

router.post('/invitations/:id/resend', async (req, res, next) => {
  try {
    const invitation = await VendorInvitation.findById(req.params.id).select('+tokenHash');
    if (!invitation) return res.status(404).json({ message: 'Invitation not found' });
    if (['submitted', 'revoked', 'processing'].includes(invitation.status)) return res.status(409).json({ message: 'This invitation cannot be resent' });
    const token = generateToken();
    invitation.tokenHash = hashToken(token);
    invitation.expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    invitation.status = 'sent';
    invitation.sendCount += 1;
    await sendInvitation(invitation, token);
    res.json({ invitation: safeInvitation(invitation), inviteUrl: onboardingUrl(token) });
  } catch (error) {
    next(error);
  }
});

router.post('/invitations/:id/revoke', async (req, res, next) => {
  try {
    const invitation = await VendorInvitation.findById(req.params.id);
    if (!invitation) return res.status(404).json({ message: 'Invitation not found' });
    if (invitation.status === 'submitted') return res.status(409).json({ message: 'A submitted invitation cannot be revoked' });
    invitation.status = 'revoked';
    invitation.revokedAt = new Date();
    invitation.revokedBy = userId(req);
    await invitation.save();
    res.json({ invitation: safeInvitation(invitation) });
  } catch (error) {
    next(error);
  }
});

router.post('/invitations/:id/rotate-link', async (req, res, next) => {
  try {
    const invitation = await VendorInvitation.findById(req.params.id).select('+tokenHash');
    if (!invitation) return res.status(404).json({ message: 'Invitation not found' });
    if (['submitted', 'revoked', 'processing'].includes(invitation.status)) return res.status(409).json({ message: 'A new link cannot be generated for this invitation' });
    const token = generateToken();
    invitation.tokenHash = hashToken(token);
    invitation.expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    invitation.status = 'sent';
    invitation.lastDeliveryError = undefined;
    await invitation.save();
    res.json({ invitation: safeInvitation(invitation), inviteUrl: onboardingUrl(token) });
  } catch (error) {
    next(error);
  }
});

router.post('/invitations/:id/retry-update-recipient', async (req, res, next) => {
  try {
    const invitation = await VendorInvitation.findById(req.params.id).populate('vendor', 'name email');
    if (!invitation) return res.status(404).json({ message: 'Invitation not found' });
    if (!isValidEmail(invitation.updateRecipientEmail)) return res.status(409).json({ message: 'No update recipient email is configured for this invitation' });
    const vendorId = invitation.vendor?._id ? String(invitation.vendor._id) : '';
    await notifyUpdateRecipient(invitation, {
      action: 'update_recipient_retry',
      companyName: invitation.vendor?.name || invitation.companyName,
      vendorId,
      vendorEmail: invitation.vendor?.email || invitation.email,
      deliveryError: invitation.updateRecipientNotificationError || invitation.lastDeliveryError || invitation.confirmationDeliveryError || invitation.staffNotificationError || 'Retrying the latest vendor onboarding update notice.'
    });
    const refreshed = await VendorInvitation.findById(invitation._id)
      .populate('invitedBy', 'firstName lastName email')
      .populate('vendor', 'name onboardingStatus isActive')
      .lean();
    res.json({ invitation: safeInvitation(refreshed) });
  } catch (error) {
    next(error);
  }
});

router.post('/vendors/:id/decision', async (req, res, next) => {
  try {
    const action = String(req.body.action || '');
    if (!['approve', 'request_changes', 'reject'].includes(action)) return res.status(400).json({ message: 'Invalid review action' });
    const message = cleanText(req.body.message, 2000);
    if (action !== 'approve' && !message) return res.status(400).json({ message: 'A review reason or instruction is required' });
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid vendor id' });

    const before = await Vendor.findById(req.params.id).select('onboardingSource onboardingStatus isActive reviewedAt reviewedBy reviewMessage');
    if (!before) return res.status(404).json({ message: 'Vendor not found' });
    if (before.onboardingSource !== 'invitation') return res.status(409).json({ message: 'This vendor was not created through onboarding' });

    const now = new Date();
    const decisionId = crypto.randomUUID();
    const nextStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'changes_requested';
    const historyAction = action === 'request_changes' ? 'changes_requested' : action === 'approve' ? 'approved' : 'rejected';
    const latestInvitation = await VendorInvitation.findOne({ vendor: req.params.id }).sort({ createdAt: -1 });
    const vendor = await Vendor.findOneAndUpdate({
      _id: req.params.id,
      onboardingSource: 'invitation',
      onboardingStatus: 'pending_review'
    }, {
      $set: {
        onboardingStatus: nextStatus,
        isActive: action === 'approve',
        reviewedAt: now,
        reviewedBy: userId(req),
        reviewMessage: message
      },
      $push: {
        onboardingHistory: {
          decisionId,
          action: historyAction,
          message,
          performedBy: userId(req),
          performedByEmail: req.user.email,
          createdAt: now
        }
      }
    }, { new: true, runValidators: true });

    if (!vendor) {
      const current = await Vendor.findById(req.params.id).select('onboardingStatus').lean();
      return res.status(409).json({
        message: `This application has already been reviewed or is not ready for review${current?.onboardingStatus ? ` (${current.onboardingStatus.replace(/_/g, ' ')})` : ''}`,
        onboardingStatus: current?.onboardingStatus
      });
    }

    let rawToken;
    let changeInvitation;

    if (action === 'request_changes') {
      rawToken = generateToken();
      changeInvitation = new VendorInvitation({
        tokenHash: hashToken(rawToken),
        email: vendor.email,
        companyName: vendor.name,
        category: vendor.category,
        categoryLabel: latestInvitation?.categoryLabel || vendor.category,
        personalMessage: message,
        updateRecipientEmail: latestInvitation?.updateRecipientEmail || '',
        purpose: 'changes_requested',
        status: 'sent',
        invitedBy: userId(req),
        invitedByEmail: req.user.email,
        vendor: vendor._id,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS)
      });
      try {
        await changeInvitation.save();
      } catch (invitationError) {
        const restoreSet = {
          onboardingStatus: 'pending_review',
          isActive: before.isActive,
          reviewMessage: before.reviewMessage || ''
        };
        const restoreUpdate = {
          $set: restoreSet,
          $pull: { onboardingHistory: { decisionId } }
        };
        const unset = {};
        if (before.reviewedAt) restoreSet.reviewedAt = before.reviewedAt; else unset.reviewedAt = '';
        if (before.reviewedBy) restoreSet.reviewedBy = before.reviewedBy; else unset.reviewedBy = '';
        if (!before.reviewMessage) unset.reviewMessage = '';
        if (Object.keys(unset).length) restoreUpdate.$unset = unset;
        await Vendor.updateOne({ _id: vendor._id, onboardingStatus: 'changes_requested', 'onboardingHistory.decisionId': decisionId }, restoreUpdate);
        throw invitationError;
      }
    }
    invalidateDashboardStatsCache();

    if (changeInvitation) {
      await sendInvitation(changeInvitation, rawToken);
      if (changeInvitation.status !== 'delivery_failed') {
        await notifyUpdateRecipient(changeInvitation, {
          action: 'changes_requested',
          companyName: vendor.name,
          vendorId: String(vendor._id),
          vendorEmail: vendor.email,
          message
        });
      }
    } else {
      let vendorDeliveryError = '';
      try {
        await sendVendorDecisionEmail({
          email: vendor.email,
          companyName: vendor.name,
          action: action === 'approve' ? 'approved' : 'rejected',
          message
        });
        await Vendor.updateOne({ _id: vendor._id }, { $set: { onboardingEmailStatus: 'sent' }, $unset: { onboardingEmailError: '' } });
        vendor.onboardingEmailStatus = 'sent';
        vendor.onboardingEmailError = undefined;
      } catch (error) {
        vendorDeliveryError = cleanText(error.message, 500);
        await Vendor.updateOne({ _id: vendor._id }, { $set: { onboardingEmailStatus: 'failed', onboardingEmailError: cleanText(error.message, 500) } });
        vendor.onboardingEmailStatus = 'failed';
        vendor.onboardingEmailError = cleanText(error.message, 500);
      }
      if (latestInvitation) {
        await notifyUpdateRecipient(latestInvitation, {
          action: vendorDeliveryError ? 'decision_delivery_failed' : nextStatus,
          companyName: vendor.name,
          vendorId: String(vendor._id),
          vendorEmail: vendor.email,
          message,
          deliveryError: vendorDeliveryError
        });
      }
    }
    res.json({ vendor, invitation: changeInvitation ? safeInvitation(changeInvitation) : null, inviteUrl: rawToken ? onboardingUrl(rawToken) : null });
  } catch (error) {
    next(error);
  }
});

router.get('/vendors/:id/tax-id', checkRole(['admin']), async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id).select('+einTaxIdEncrypted +einTaxIdIv +einTaxIdTag +einTaxId');
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    const taxId = vendor.einTaxIdEncrypted
      ? decryptTaxId({ encrypted: vendor.einTaxIdEncrypted, iv: vendor.einTaxIdIv, tag: vendor.einTaxIdTag })
      : vendor.einTaxId || null;
    if (!taxId) return res.status(404).json({ message: 'No Tax ID is stored for this vendor' });
    await SecurityAuditEvent.create({
      action: 'vendor_tax_id_revealed',
      userId: userId(req),
      userEmail: req.user.email,
      entityType: 'vendor',
      entityId: String(vendor._id),
      ipAddress: req.ip,
      userAgent: cleanText(req.get('user-agent'), 500)
    });
    res.set('Cache-Control', 'no-store');
    res.json({ taxId });
  } catch (error) {
    next(error);
  }
});

router.post('/vendors/:id/retry-email', async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    if (!['approved', 'rejected'].includes(vendor.onboardingStatus)) return res.status(409).json({ message: 'There is no final decision email to retry' });
    try {
      await sendVendorDecisionEmail({
        email: vendor.email,
        companyName: vendor.name,
        action: vendor.onboardingStatus,
        message: vendor.reviewMessage
      });
      vendor.onboardingEmailStatus = 'sent';
      vendor.onboardingEmailError = undefined;
      await vendor.save();
      res.json({ message: 'Vendor decision email sent' });
    } catch (error) {
      vendor.onboardingEmailStatus = 'failed';
      vendor.onboardingEmailError = cleanText(error.message, 500);
      await vendor.save();
      res.status(502).json({ message: 'Email delivery failed and can be retried', error: vendor.onboardingEmailError });
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports._test = { generateToken, hashToken, validFileSignature, normalizeEmail, safeInvitation, reviewPayload, escapeRegex };
