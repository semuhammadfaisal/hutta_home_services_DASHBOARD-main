require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mongoose = require('mongoose');
const CommercialPortalPreference = require('./models/CommercialPortalPreference');
const CommercialOrganization = require('./models/CommercialOrganization');
const Notification = require('./models/Notification');
const User = require('./models/User');
const { capabilities, propertyAccess, tierEntitlements } = require('./utils/commercialAccess');
const { deliverEmail } = require('./utils/emailService');
const { buildPublicUrl } = require('./utils/publicAppUrl');
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function phoenixSchedule(now = new Date()) {
  const local = new Date(new Date(now).getTime() - 7 * 60 * 60 * 1000);
  const currentMonthStart = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1));
  const previousMonth = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1));
  return { day: local.getUTCDate(), periodKey: previousMonth.toISOString().slice(0, 7), currentMonthStartedAt: new Date(currentMonthStart.getTime() + 7 * 60 * 60 * 1000) };
}

async function run(now = new Date()) {
  const schedule = phoenixSchedule(now);
  const retryExpiredLease = { 'monthlyReports.lastDeliveryStatus': 'processing', 'monthlyReports.lastDeliveryAttemptAt': { $lte: new Date(now.getTime() - 60 * 60 * 1000) } };
  const due = await CommercialPortalPreference.find({ 'monthlyReports.enabled': true, 'monthlyReports.deliveryDay': { $lte: schedule.day }, $or: [{ 'monthlyReports.lastDeliveryPeriodKey': { $ne: schedule.periodKey } }, { 'monthlyReports.lastDeliveryStatus': 'failed' }, retryExpiredLease] }).lean();
  const summary = { due: due.length, delivered: 0, failed: 0, skipped: 0 };
  for (const preference of due) {
    const claimed = await CommercialPortalPreference.findOneAndUpdate({ _id: preference._id, $or: [{ 'monthlyReports.lastDeliveryPeriodKey': { $ne: schedule.periodKey } }, { 'monthlyReports.lastDeliveryStatus': 'failed' }, retryExpiredLease] }, { $set: { 'monthlyReports.lastDeliveryPeriodKey': schedule.periodKey, 'monthlyReports.lastDeliveryStatus': 'processing', 'monthlyReports.lastDeliveryAttemptAt': now }, $unset: { 'monthlyReports.lastDeliveryError': 1 } }, { new: true }).lean();
    if (!claimed) { summary.skipped += 1; continue; }
    try {
      const allowed = [];
      for (const propertyId of claimed.monthlyReports.propertyIds || []) {
        const access = await propertyAccess(claimed.userId, claimed.organizationId, propertyId, now);
        if (access && capabilities(access).canViewReports && tierEntitlements(access.agreement?.tier).monthlyReports) allowed.push(String(propertyId));
      }
      if (!allowed.length) throw new Error('No currently authorized report properties');
      const [user, organization] = await Promise.all([User.findOne({ _id: claimed.userId, role: 'commercial', isActive: true }).select('email firstName').lean(), CommercialOrganization.findOne({ _id: claimed.organizationId, status: 'active' }).select('name').lean()]);
      if (!user || !organization) throw new Error('Commercial report recipient is unavailable');
      const reportUrl = buildPublicUrl('/pages/commercial-portal.html', 'reports');
      await Notification.create({ userId: user._id, title: `${schedule.periodKey} commercial report ready`, message: `${organization.name} monthly summary is ready for ${allowed.length} authorized ${allowed.length === 1 ? 'property' : 'properties'}.`, type: 'info', actionUrl: '#reports', metadata: { organizationId: organization._id, reportPeriod: schedule.periodKey, propertyIds: allowed } });
      if (claimed.notifications?.email !== false && claimed.notifications?.reportReady !== false) await deliverEmail({ to: [user.email], subject: `${organization.name} monthly report is ready`, text: `Your ${schedule.periodKey} commercial summary is ready: ${reportUrl}`, html: `<p>Hello ${escapeHtml(user.firstName || 'there')},</p><p>Your ${schedule.periodKey} commercial summary for ${escapeHtml(organization.name)} is ready.</p><p><a href="${reportUrl}">Open reports</a></p>` });
      await CommercialPortalPreference.updateOne({ _id: claimed._id, 'monthlyReports.lastDeliveryPeriodKey': schedule.periodKey }, { $set: { 'monthlyReports.lastDeliveryStatus': 'delivered', 'monthlyReports.lastDeliveredAt': now } }); summary.delivered += 1;
    } catch (error) {
      await CommercialPortalPreference.updateOne({ _id: claimed._id }, { $set: { 'monthlyReports.lastDeliveryStatus': 'failed', 'monthlyReports.lastDeliveryError': String(error.message || error).slice(0, 500) } }); summary.failed += 1;
    }
  }
  return summary;
}

if (require.main === module) { if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required'); mongoose.connect(process.env.MONGODB_URI).then(() => run()).then(summary => process.stdout.write(`${JSON.stringify(summary)}\n`)).catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect()); }
module.exports = { phoenixSchedule, run };
