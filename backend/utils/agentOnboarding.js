const AgentClientInvitation = require('../models/AgentClientInvitation');
const Property = require('../models/Property');
const PropertyMembership = require('../models/PropertyMembership');
const User = require('../models/User');

const present = value => Boolean(String(value || '').trim());

async function homeownerOnboarding(transaction, now = new Date()) {
  const [invitation, ownerMemberships, agentMembership, property] = await Promise.all([
    AgentClientInvitation.findOne({ transactionId: transaction._id }).select('deliveryStatus history status consent acceptedByUserId').lean(),
    PropertyMembership.find({ customerId: transaction.customerId, propertyId: transaction.propertyId, relationship: 'owner', status: 'active' }).select('userId').lean(),
    PropertyMembership.findOne({ userId: transaction.agentUserId, sourceTransactionId: transaction._id, relationship: 'agent' }).select('status endsAt').lean(),
    Property.findOne({ _id: transaction.propertyId, ownerCustomerId: transaction.customerId, status: 'active' }).select('label addressLine1 city state postalCode propertyType').lean()
  ]);
  const owners = await User.find({ _id: { $in: ownerMemberships.map(item => item.userId) }, role: 'residential', isActive: true }).select('_id email firstName lastName phone').lean();
  const delivered = ['sent', 'copy_only'].includes(invitation?.deliveryStatus) || (invitation?.history || []).some(item => item.action === 'sent');
  const opened = (invitation?.history || []).some(item => item.action === 'viewed');
  const accountActive = owners.length > 0;
  const propertyConfirmed = invitation?.consent?.propertyConfirmed === true;
  const consentAccepted = Boolean(invitation?.consent?.acceptedAt && invitation?.consent?.typedName);
  const accessActive = transaction.status === 'active' && new Date(transaction.accessEndsAt) > now && agentMembership?.status === 'active' && new Date(agentMembership.endsAt) > now;
  const profileComplete = owners.some(owner => present(owner.firstName) && present(owner.lastName) && present(owner.phone));
  const propertyComplete = Boolean(property && present(property.label) && present(property.addressLine1) && present(property.city) && present(property.state) && present(property.postalCode) && present(property.propertyType));
  const steps = [
    ['invitation_delivered', 'Invitation delivered', delivered, false],
    ['invitation_opened', 'Invitation opened', opened, !opened],
    ['account_activated', 'Residential account activated', accountActive, !accountActive],
    ['property_confirmed', 'Property details confirmed', propertyConfirmed, !propertyConfirmed],
    ['consent_accepted', 'Permissions and consent accepted', consentAccepted, !consentAccepted],
    ['access_active', 'Transaction access active', accessActive, false],
    ['homeowner_profile_complete', 'Homeowner profile essentials completed', profileComplete, !profileComplete],
    ['property_profile_complete', 'Property essentials completed', propertyComplete, !propertyComplete]
  ].map(([key, label, complete, actionable]) => ({ key, label, complete, actionable }));
  const ready = accountActive && propertyConfirmed && consentAccepted && accessActive && profileComplete && propertyComplete;
  steps.push({ key: 'ready_for_service', label: 'Ready for agent-requested service', complete: ready, actionable: false });
  return { complete: ready, completedCount: steps.filter(step => step.complete).length, totalCount: steps.length, steps, reminderAvailable: steps.some(step => step.actionable && !step.complete), ownerUserIds: owners.map(owner => owner._id), owners };
}

function publicOnboarding(value) {
  return { complete: value.complete, completedCount: value.completedCount, totalCount: value.totalCount, steps: value.steps, reminderAvailable: value.reminderAvailable };
}

module.exports = { homeownerOnboarding, publicOnboarding };
