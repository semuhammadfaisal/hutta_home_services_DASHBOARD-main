const crypto = require('crypto');
const mongoose = require('mongoose');
const Counter = require('../models/Counter');
const Customer = require('../models/Customer');
const EmailOutbox = require('../models/EmailOutbox');
const IntakeSubmission = require('../models/IntakeSubmission');
const Notification = require('../models/Notification');
const Order = require('../models/Order');
const User = require('../models/User');
const memCache = require('./memoryCache');
const { invalidateDashboardStatsCache } = require('./dashboardStatsCache');

const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 32 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone(value) {
  const input = String(value || '').trim();
  const digits = input.replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

function sanitizeText(value, maxLength) {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

function safeSecretEqual(supplied, expected) {
  const suppliedBuffer = Buffer.from(String(supplied || ''), 'utf8');
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  return suppliedBuffer.length > 0 &&
    suppliedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function unwrapForminatorValue(value) {
  if (Array.isArray(value)) return value.map(unwrapForminatorValue).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    for (const key of ['value', 'raw', 'field_value']) {
      if (Object.prototype.hasOwnProperty.call(value, key)) return unwrapForminatorValue(value[key]);
    }
    return Object.values(value).map(unwrapForminatorValue).filter(Boolean).join(' ');
  }
  return value == null ? '' : String(value);
}

function findForminatorField(value, fieldName, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 8) return undefined;
  if (Object.prototype.hasOwnProperty.call(value, fieldName)) return unwrapForminatorValue(value[fieldName]);
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === 'object' && (item.name === fieldName || item.field_name === fieldName)) {
        return unwrapForminatorValue(item.value ?? item.field_value ?? item.raw);
      }
    }
  }
  for (const nested of Object.values(value)) {
    const found = findForminatorField(nested, fieldName, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function firstForminatorValue(body, names) {
  for (const name of names) {
    const value = findForminatorField(body, name);
    if (value !== undefined && String(value).trim()) return String(value).trim();
  }
  return '';
}

function formInputChecked(value) {
  if (value === true || value === 1) return true;
  const normalized = String(value || '').trim().toLowerCase();
  return Boolean(normalized) && !['0', 'false', 'no', 'off', 'unchecked'].includes(normalized);
}

function mapForminatorPayload(body, rawBody = Buffer.alloc(0), now = new Date()) {
  const formId = firstForminatorValue(body, ['form_id', 'formId', 'form-id']) ||
    String(process.env.FORMINATOR_FORM_ID || '1029');
  const entryId = firstForminatorValue(body, ['entry_id', 'entryId', 'submission_id', 'submissionId']);
  const fingerprintSource = rawBody.length ? rawBody : Buffer.from(JSON.stringify(body || {}));
  const fingerprint = crypto.createHash('sha256').update(fingerprintSource).digest('hex').slice(0, 32);
  const submittedAtValue = firstForminatorValue(body, ['submittedAt', 'submitted_at', 'date_created', 'submission_time', 'entry-time', 'entry_time']);
  const submittedAt = submittedAtValue && !Number.isNaN(new Date(submittedAtValue).getTime())
    ? submittedAtValue
    : now.toISOString();

  return {
    externalSubmissionId: sanitizeText(`forminator-${formId}-${entryId || fingerprint}`, 128),
    submittedAt,
    name: firstForminatorValue(body, ['name-1', 'name_1']),
    phone: firstForminatorValue(body, ['phone-1', 'phone_1']),
    email: firstForminatorValue(body, ['email-1', 'email_1']),
    serviceDetails: firstForminatorValue(body, ['textarea-1', 'textarea_1']),
    marketingSmsConsent: formInputChecked(
      findForminatorField(body, 'consent-1') ?? findForminatorField(body, 'consent_1')
    )
  };
}

function isForminatorConnectionProbe(headerValue) {
  return String(headerValue || '').trim().toLowerCase() === 'true';
}

function parseOperationsRecipients(value = process.env.INTAKE_NOTIFICATION_EMAILS) {
  return [...new Set(String(value || '')
    .split(',')
    .map(normalizeEmail)
    .filter(email => EMAIL_PATTERN.test(email)))];
}

function validatePayload(body) {
  const payload = {
    externalSubmissionId: sanitizeText(body?.externalSubmissionId, 128),
    submittedAt: new Date(body?.submittedAt),
    name: sanitizeText(body?.name, 160),
    phone: normalizePhone(body?.phone),
    email: normalizeEmail(body?.email),
    serviceDetails: sanitizeText(body?.serviceDetails, 5000),
    marketingSmsConsent: body?.marketingSmsConsent === true
  };

  const errors = [];
  if (!payload.externalSubmissionId || !/^[A-Za-z0-9._:-]{8,128}$/.test(payload.externalSubmissionId)) errors.push('externalSubmissionId is invalid');
  if (Number.isNaN(payload.submittedAt.getTime())) errors.push('submittedAt must be a valid timestamp');
  if (!payload.name) errors.push('name is required');
  if (payload.phone.length < 10 || payload.phone.length > 15) errors.push('phone is invalid');
  if (!EMAIL_PATTERN.test(payload.email)) errors.push('email is invalid');

  return { payload, errors };
}

function signatureFor(rawBody, timestamp, secret) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');
}

function verifyWebhookSignature({ rawBody, timestamp, signature, secret, now = Date.now() }) {
  if (!secret || !Buffer.isBuffer(rawBody) || !timestamp || !signature) return false;
  const timestampMs = Number(timestamp) < 1e12 ? Number(timestamp) * 1000 : Number(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > SIGNATURE_TOLERANCE_MS) return false;
  const supplied = String(signature).replace(/^sha256=/i, '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false;
  const expected = signatureFor(rawBody, timestamp, secret);
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'));
}

async function nextCounter(name, session) {
  const counter = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { value: 1 } },
    { new: true, upsert: true, session, setDefaultsOnInsert: true }
  );
  return counter.value;
}

function responseFor(intake, duplicate = false) {
  return {
    success: true,
    requestReference: intake.requestReference,
    status: 'received',
    duplicate
  };
}

async function findCompletedDuplicate(externalSubmissionId) {
  const intake = await IntakeSubmission.findOne({ externalSubmissionId }).select('requestReference status').lean();
  return intake?.requestReference ? responseFor(intake, true) : null;
}

async function processWebsiteRequest(payload) {
  const duplicate = await findCompletedDuplicate(payload.externalSubmissionId);
  if (duplicate) return duplicate;

  const session = await mongoose.startSession();
  let createdIntake;
  let wasDuplicate = false;
  try {
    await session.withTransaction(async () => {
      const existing = await IntakeSubmission.findOne({ externalSubmissionId: payload.externalSubmissionId }).session(session);
      if (existing) {
        createdIntake = existing;
        wasDuplicate = true;
        return;
      }

      const requestSequence = await nextCounter(`website-request:${new Date().getUTCFullYear()}`, session);
      const requestReference = `REQ-${new Date().getUTCFullYear()}-${String(requestSequence).padStart(6, '0')}`;
      const [intake] = await IntakeSubmission.create([{
        requestReference,
        externalSubmissionId: payload.externalSubmissionId,
        submittedAt: payload.submittedAt,
        normalizedCustomer: { name: payload.name, email: payload.email, phone: payload.phone },
        formSnapshot: {
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
          serviceDetails: payload.serviceDetails
        },
        marketingSmsConsent: payload.marketingSmsConsent,
        marketingSmsConsentAt: payload.marketingSmsConsent ? new Date() : undefined,
        status: 'processing'
      }], { session });

      const escapedEmail = payload.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const emailPattern = new RegExp(`^${escapedEmail}$`, 'i');
      const matches = await Customer.find({
        $or: [
          { email: emailPattern },
          { 'emails.address': emailPattern }
        ]
      }).session(session);

      let customer = null;
      let requiresReview = matches.length > 1;
      let matchReason = matches.length > 1 ? 'multiple_email_matches' : matches.length === 1 ? 'email_match' : 'new_customer';

      if (matches.length === 1) {
        customer = matches[0];
        const storedPhone = normalizePhone(customer.phone || customer.phones?.find(phone => phone.isPrimary)?.number || customer.phones?.[0]?.number);
        if (storedPhone && storedPhone !== payload.phone) {
          requiresReview = true;
          matchReason = 'email_match_phone_mismatch';
        }
      } else if (matches.length === 0) {
        [customer] = await Customer.create([{
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
          customerType: 'one-time',
          status: 'active'
        }], { session });
      }

      const orderSequence = await nextCounter('orders', session);
      const orderId = `ORD-${String(orderSequence).padStart(6, '0')}`;
      const customerOrderCount = await Order.countDocuments({
        'customer.email': payload.email,
        workOrderNumber: { $exists: true }
      }).session(session);

      const [order] = await Order.create([{
        orderId,
        workOrderNumber: `WO-${String(customerOrderCount + 1).padStart(2, '0')}`,
        customerId: customer?._id,
        customer: { name: payload.name, email: payload.email, phone: payload.phone, address: '' },
        service: 'Unclassified Website Request',
        amount: null,
        vendorCost: 0,
        processingFee: 0,
        profit: 0,
        status: 'new',
        priority: 'medium',
        description: payload.serviceDetails,
        source: 'website',
        intakeSubmissionId: intake._id,
        requestReference,
        workflowStatus: 'request_received',
        pricingStatus: 'unquoted',
        missingData: { serviceCategory: true, serviceAddress: true },
        requiresIntakeReview: requiresReview,
        submittedContact: { name: payload.name, email: payload.email, phone: payload.phone }
      }], { session });

      const staff = await User.find({
        isActive: true,
        role: { $in: ['admin', 'manager', 'account_rep'] }
      }).select('_id').session(session).lean();
      if (staff.length) {
        await Notification.insertMany(staff.map(user => ({
          userId: user._id,
          title: 'New website request',
          message: `${payload.name} submitted request ${requestReference}.`,
          type: 'order',
          priority: 'high',
          actionUrl: '#workflow-center',
          metadata: { intakeSubmissionId: intake._id, orderId: order._id, requestReference }
        })), { session });
      }

      const emailPayload = {
        requestReference,
        customerName: payload.name,
        email: payload.email,
        phone: payload.phone,
        serviceDetails: payload.serviceDetails,
        orderId: order._id.toString()
      };
      const outboxMessages = [{
        type: 'website_customer_confirmation',
        dedupeKey: `${requestReference}:customer-confirmation`,
        recipients: [payload.email],
        payload: emailPayload,
        intakeSubmissionId: intake._id,
        orderId: order._id
      }];
      const operationsRecipients = parseOperationsRecipients();
      if (operationsRecipients.length) {
        outboxMessages.push({
          type: 'website_operations_alert',
          dedupeKey: `${requestReference}:operations-alert`,
          recipients: operationsRecipients,
          payload: emailPayload,
          intakeSubmissionId: intake._id,
          orderId: order._id
        });
      }
      await EmailOutbox.insertMany(outboxMessages, { session });

      intake.orderId = order._id;
      intake.customerId = customer?._id;
      intake.customerMatchCount = matches.length;
      intake.matchingCustomerIds = matches.map(match => match._id);
      intake.customerMatchReason = matchReason;
      intake.requiresReview = requiresReview;
      intake.status = requiresReview ? 'review_required' : 'completed';
      if (!operationsRecipients.length) intake.operationsAlert.status = 'skipped';
      await intake.save({ session });
      createdIntake = intake;
    });
  } catch (error) {
    if (error?.code === 11000) {
      const duplicateResult = await findCompletedDuplicate(payload.externalSubmissionId);
      if (duplicateResult) return duplicateResult;
    }
    throw error;
  } finally {
    await session.endSession();
  }

  memCache.del('orders:stats:v2');
  invalidateDashboardStatsCache();
  return responseFor(createdIntake, wasDuplicate);
}

module.exports = {
  MAX_BODY_BYTES,
  SIGNATURE_TOLERANCE_MS,
  normalizeEmail,
  normalizePhone,
  parseOperationsRecipients,
  processWebsiteRequest,
  isForminatorConnectionProbe,
  mapForminatorPayload,
  safeSecretEqual,
  signatureFor,
  validatePayload,
  verifyWebhookSignature
};
