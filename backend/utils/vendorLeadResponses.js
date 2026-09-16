const QuoteInvitation = require('../models/QuoteInvitation');
const VendorPerformanceEvent = require('../models/VendorPerformanceEvent');

const DECLINE_CODES = new Set(['capacity', 'outside_scope', 'outside_service_area', 'schedule', 'pricing', 'compliance', 'other']);
function clean(value, max = 1000) { return String(value || '').trim().slice(0, max); }

async function recordPerformanceEvent({ invitation, type, responseTimeMs, metadata = {}, session }) {
  return VendorPerformanceEvent.updateOne(
    { dedupeKey: `${invitation._id}:${type}` },
    { $setOnInsert: { vendorId: invitation.vendorId, orderId: invitation.orderId, invitationId: invitation._id, type, responseTimeMs, occurredAt: new Date(), dedupeKey: `${invitation._id}:${type}`, metadata } },
    { upsert: true, session }
  );
}

async function respondToLead({ invitationId, vendorId, response, declineReasonCode, declineReason, actorId, now = new Date() }) {
  if (!['accept', 'decline'].includes(response)) throw Object.assign(new Error('Response must be accept or decline'), { status: 400 });
  const code = clean(declineReasonCode, 40); const reason = clean(declineReason);
  if (response === 'decline' && (!DECLINE_CODES.has(code) || !reason)) throw Object.assign(new Error('Decline reason and valid reason code are required'), { status: 400 });
  const currentForTiming = await QuoteInvitation.findOne({ _id: invitationId, vendorId }).select('sentAt createdAt status');
  if (!currentForTiming) throw Object.assign(new Error('This lead is unavailable'), { status: 404 });
  const responseTimeMs = Math.max(0, now.getTime() - new Date(currentForTiming.sentAt || currentForTiming.createdAt).getTime());
  const query = { _id: invitationId, vendorId, responseRequired: true, status: { $in: ['sent', 'delivery_failed'] }, expiresAt: { $gt: now }, $or: [{ responseDueAt: { $exists: false } }, { responseDueAt: { $gt: now } }] };
  const update = response === 'accept'
    ? { $set: { status: 'accepted_to_bid', acceptedAt: now, respondedAt: now, responseTimeMs }, $push: { responseHistory: { action: 'accepted_to_bid', actorType: 'vendor', actorId, createdAt: now } } }
    : { $set: { status: 'declined', declinedAt: now, respondedAt: now, responseTimeMs, declineReasonCode: code, declineReason: reason }, $push: { responseHistory: { action: 'declined', actorType: 'vendor', actorId, message: reason, createdAt: now } } };
  const invitation = await QuoteInvitation.findOneAndUpdate(query, update, { new: true });
  if (!invitation) {
    const current = await QuoteInvitation.findOne({ _id: invitationId, vendorId });
    const expected = response === 'accept' ? 'accepted_to_bid' : 'declined';
    if (current?.status === expected) return { invitation: current, reused: true };
    throw Object.assign(new Error('This lead is expired, closed, or already answered'), { status: 409 });
  }
  await recordPerformanceEvent({ invitation, type: response === 'accept' ? 'lead_accepted' : 'lead_declined', responseTimeMs: invitation.responseTimeMs, metadata: response === 'decline' ? { declineReasonCode: code } : {} });
  return { invitation, reused: false };
}

async function recordBidSubmission(invitation, now = new Date()) {
  const late = invitation.bidDueAt && now > new Date(invitation.bidDueAt);
  await recordPerformanceEvent({ invitation, type: late ? 'bid_submitted_late' : 'bid_submitted_on_time', metadata: { bidDueAt: invitation.bidDueAt || null } });
  return late;
}

module.exports = { DECLINE_CODES, recordBidSubmission, recordPerformanceEvent, respondToLead };
