const { complianceChecklist } = require('./vendorCompliance');
const { expirationWarnings } = require('./vendorAssignments');

function rate(numerator, denominator) { return denominator ? Math.round((numerator / denominator) * 100) : null; }
function summary({ vendor, events = [], invitations = [], schedules = [], completions = [] }) {
  const responded = invitations.filter(item => item.respondedAt);
  const responseOnTime = responded.filter(item => !item.responseDueAt || new Date(item.respondedAt) <= new Date(item.responseDueAt)).length;
  const bids = events.filter(item => ['bid_submitted_on_time', 'bid_submitted_late', 'bid_due_missed'].includes(item.type));
  const bidOnTime = events.filter(item => item.type === 'bid_submitted_on_time').length;
  const decidedSchedules = schedules.filter(item => ['accepted', 'changes_requested'].includes(item.status));
  const acceptedSchedules = schedules.filter(item => item.status === 'accepted');
  const completed = completions.filter(item => item.status === 'completed');
  const documented = completed.filter(item => (item.beforePhotos || []).length && (item.afterPhotos || []).length && String(item.completionNotes || '').trim());
  return {
    periodDays: 90,
    responseTimeliness: { label: 'Response timeliness', rate: rate(responseOnTime, responded.length), onTime: responseOnTime, total: responded.length },
    estimateSubmission: { label: 'Estimate submission', rate: rate(bidOnTime, bids.length), onTime: bidOnTime, total: bids.length },
    scheduleReliability: { label: 'Schedule acceptance', rate: rate(acceptedSchedules.length, decidedSchedules.length), accepted: acceptedSchedules.length, total: decidedSchedules.length },
    completionDocumentation: { label: 'Complete documentation', rate: rate(documented.length, completed.length), complete: documented.length, total: completed.length },
    compliance: { label: 'Compliance', complete: complianceChecklist(vendor).filter(item => item.complete).length, total: complianceChecklist(vendor).length, warnings: expirationWarnings(vendor) },
    context: 'Metrics reflect recorded portal activity only and include only the five categories shown.',
    invitationCount: invitations.length
  };
}

module.exports = { rate, summary };
