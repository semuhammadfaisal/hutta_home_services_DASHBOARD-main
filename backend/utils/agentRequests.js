const { SERVICE_CATEGORIES, cleanText } = require('./residentialRequests');

const AGENT_URGENCIES = Object.freeze(['routine', 'soon', 'urgent', 'emergency']);

function phoenixDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = type => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function parseTargetDeadline(value) {
  const text = cleanText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T19:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text ? null : parsed;
}

function validateAgentRequest(body = {}, transaction = {}, now = new Date()) {
  const targetCompletionDeadline = parseTargetDeadline(body.targetCompletionDeadline);
  const payload = {
    serviceCategory: cleanText(body.serviceCategory || body.service, 120),
    scopeOfWork: cleanText(body.scopeOfWork || body.description, 5000),
    urgency: cleanText(body.urgency, 30).toLowerCase(),
    targetCompletionDeadline,
    preferredTiming: cleanText(body.preferredTiming, 500),
    accessInstructions: cleanText(body.accessInstructions, 1000)
  };
  const errors = [];
  if (!SERVICE_CATEGORIES.includes(payload.serviceCategory)) errors.push('Select a valid service category');
  if (payload.scopeOfWork.length < 10) errors.push('Enter a scope of work with at least 10 characters');
  if (!AGENT_URGENCIES.includes(payload.urgency)) errors.push('Select a valid urgency');
  if (!payload.targetCompletionDeadline || payload.targetCompletionDeadline <= now) errors.push('Select a future target completion deadline');
  if (payload.targetCompletionDeadline && transaction.closeDate && phoenixDate(payload.targetCompletionDeadline) > phoenixDate(transaction.closeDate)) errors.push('Target completion deadline cannot be after the transaction close date');
  if (!payload.preferredTiming) errors.push('Preferred timing is required');
  return { payload, errors };
}

function deadlineRisk(order = {}, transaction = {}, quote = null, confirmedSchedule = null, now = new Date()) {
  const workflow = String(order.workflowStatus || order.status || '').toLowerCase();
  const completed = ['completed', 'awaiting_customer_closeout'].includes(workflow) || Boolean(order.completedAt);
  const target = new Date(order.residentialRequest?.targetCompletionDeadline || transaction.closeDate);
  if (completed) return { level: 'ready', reason: 'Work is complete', deadline: Number.isNaN(target.getTime()) ? null : target };
  if (Number.isNaN(target.getTime())) return { level: 'unknown', reason: 'No confirmed deadline is available', deadline: null };
  const remainingHours = (target.getTime() - now.getTime()) / 3600000;
  if (confirmedSchedule?.proposedEnd) {
    const scheduledEnd = new Date(confirmedSchedule.proposedEnd);
    if (!Number.isNaN(scheduledEnd.getTime()) && scheduledEnd > target) return { level: 'critical', reason: 'Confirmed schedule ends after the target deadline', deadline: target };
    return { level: remainingHours <= 48 ? 'watch' : 'on_track', reason: 'Confirmed schedule is before the target deadline', deadline: target };
  }
  if (remainingHours <= 48) return { level: 'critical', reason: 'Deadline is within 48 hours and no schedule is confirmed', deadline: target };
  if (remainingHours <= 168 && !quote) return { level: 'high', reason: 'Deadline is within 7 days and no client-facing estimate is available', deadline: target };
  if (remainingHours <= 168) return { level: 'watch', reason: 'Deadline is within 7 days and scheduling is not confirmed', deadline: target };
  return { level: 'on_track', reason: 'No confirmed deadline conflict', deadline: target };
}

function median(values = []) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

module.exports = { AGENT_URGENCIES, deadlineRisk, median, parseTargetDeadline, phoenixDate, validateAgentRequest };
