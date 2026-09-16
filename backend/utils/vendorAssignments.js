const mongoose = require('mongoose');

const TRANSITIONS = Object.freeze({
  assigned: ['schedule_pending', 'cancelled'],
  schedule_pending: ['schedule_changes_requested', 'scheduled', 'cancelled'],
  schedule_changes_requested: ['schedule_pending', 'cancelled'],
  scheduled: ['en_route', 'in_progress', 'cancelled'],
  en_route: ['in_progress'],
  in_progress: ['completion_submitted'],
  completion_submitted: ['completed'],
  completed: [], cancelled: []
});

function id(value) { return value == null ? null : String(value); }
function validId(value) { return mongoose.Types.ObjectId.isValid(value); }
function findAssignment(order, assignmentId, vendorId) {
  if (!order || !validId(assignmentId)) return null;
  const assignment = order.vendorAssignments?.id?.(assignmentId) || order.vendorAssignments?.find(item => id(item._id) === id(assignmentId));
  return assignment && id(assignment.vendor?._id || assignment.vendor) === id(vendorId) ? assignment : null;
}
function canTransition(from, to) { return Boolean(TRANSITIONS[from]?.includes(to)); }
function transition(assignment, next, actor, message = '') {
  if (!canTransition(assignment.status || 'assigned', next)) throw Object.assign(new Error(`Assignment cannot move from ${assignment.status || 'assigned'} to ${next}`), { status: 409 });
  assignment.status = next;
  assignment.statusHistory.push({ status: next, actorType: actor.type, actorId: actor.id, message: String(message || '').trim().slice(0, 500) });
}
function expirationWarnings(vendor, now = new Date(), days = 45) {
  const threshold = now.getTime() + days * 86400000;
  const records = [
    ['roc_license', 'ROC license', vendor?.rocLicenseExpirationDate],
    ['coi', 'Certificate of Insurance', vendor?.coiProfile?.expirationDate || vendor?.insuranceExpirationDate],
    ['workers_comp', 'Workers compensation', vendor?.workersCompProfile?.required === false ? null : vendor?.workersCompProfile?.expirationDate]
  ];
  return records.filter(([, , value]) => value && new Date(value).getTime() <= threshold).map(([key, label, value]) => {
    const expiresAt = new Date(value); const remaining = Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000);
    return { key, label, expiresAt, severity: remaining < 0 ? 'expired' : remaining <= 14 ? 'critical' : 'warning', daysRemaining: remaining };
  });
}
function redactContact(value) {
  return String(value || '').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[contact hidden]').replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, '[contact hidden]').trim().slice(0, 3000);
}
function serializeMessage(item) { return { id: id(item._id), sender: item.senderType === 'vendor' ? 'Your team' : 'SMPLfix', body: redactContact(item.body), sentAt: item.createdAt }; }
function serializeAssignment(order, assignment, related = {}) {
  const propertyAddress = order.customer?.address || related.propertyAddress || '';
  const billingLane = related.vendorLicensed ? 'owner_billed' : (assignment.billingLane || 'smplfix_direct');
  return {
    id: id(assignment._id), orderId: id(order._id), orderReference: order.orderId, service: assignment.service || order.service,
    propertyAddress, scope: redactContact(assignment.scope || related.schedule?.jobSnapshot?.scopeOfWork || order.description || ''),
    scheduledWindow: { start: related.schedule?.proposedStart || assignment.scheduledStart, end: related.schedule?.proposedEnd || assignment.scheduledEnd || null, timezone: related.schedule?.timezone || assignment.timezone || 'America/Phoenix' },
    siteAccessInstructions: redactContact(related.schedule?.accessInstructions || assignment.accessInstructions || order.customerIntake?.accessInstructions || ''),
    status: assignment.status || (related.schedule?.status === 'accepted' ? 'scheduled' : 'assigned'), billingLane,
    schedule: related.schedule ? { id: id(related.schedule._id), reference: related.schedule.scheduleReference, revision: related.schedule.revisionNumber, status: related.schedule.status, start: related.schedule.proposedStart, end: related.schedule.proposedEnd, timezone: related.schedule.timezone, canRespond: related.schedule.status === 'pending_vendor' && new Date(related.schedule.proposedStart) > new Date() } : null,
    completionRules: { requireServiceNotes: assignment.completionRules?.requireServiceNotes !== false, requireBeforePhotos: assignment.completionRules?.requireBeforePhotos !== false, requireAfterPhotos: assignment.completionRules?.requireAfterPhotos !== false },
    completion: related.completion ? { id: id(related.completion._id), reference: related.completion.completionReference, status: related.completion.status, completedAt: related.completion.completedAt } : null,
    messages: (related.messages || []).filter(item => item.status !== 'hidden').map(serializeMessage), complianceWarnings: related.complianceWarnings || [],
    capabilities: { canMessage: true, canAcceptSchedule: related.schedule?.status === 'pending_vendor', canUpdateStatus: ['scheduled', 'en_route', 'in_progress'].includes(assignment.status), canSubmitCompletion: assignment.status === 'in_progress', canSubmitInvoice: ['completion_submitted', 'completed'].includes(assignment.status) && !assignment.vendorInvoiceId }
  };
}

module.exports = { TRANSITIONS, canTransition, expirationWarnings, findAssignment, redactContact, serializeAssignment, transition };
