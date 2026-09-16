const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Organization = require('../models/CommercialOrganization');
const Membership = require('../models/CommercialMembership');
const Audit = require('../models/CommercialAuditEvent');
function parseOrganizationChoice(body) {
  const organizationId = typeof body.organizationId === 'string' ? body.organizationId.trim() : '';
  const newOrganizationName = typeof body.newOrganizationName === 'string' ? body.newOrganizationName.trim() : '';
  if (organizationId && newOrganizationName) throw Object.assign(new Error('Choose an existing organization or create one, not both'), { status: 400 });
  if (organizationId && !mongoose.Types.ObjectId.isValid(organizationId)) throw Object.assign(new Error('Invalid organization ID'), { status: 400 });
  if (newOrganizationName && (newOrganizationName.length < 2 || newOrganizationName.length > 180)) throw Object.assign(new Error('Organization name must contain 2–180 characters'), { status: 400 });
  const role = body.commercialMembershipRole || 'viewer';
  if (!['organization_admin', 'operations_manager', 'billing_admin', 'viewer'].includes(role)) throw Object.assign(new Error('Invalid organization membership role'), { status: 400 });
  return { organizationId, newOrganizationName, role };
}
async function approveCommercialUser(userId, body, actorUserId) {
  if (!mongoose.Types.ObjectId.isValid(String(userId))) throw Object.assign(new Error('Invalid user ID'), { status: 400 });
  const choice = parseOrganizationChoice(body);
  const session = await mongoose.startSession();
  let user;
  try {
    await session.withTransaction(async () => {
      user = await User.findById(userId).select('-password').session(session);
      if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
      let organization;
      if (choice.organizationId) organization = await Organization.findOne({ _id: choice.organizationId, status: 'active' }).session(session);
      else if (choice.newOrganizationName) [organization] = await Organization.create([{ organizationCode: `COM-${crypto.randomBytes(8).toString('hex').toUpperCase()}`, name: choice.newOrganizationName, createdBy: actorUserId }], { session });
      else {
        const membership = await Membership.findOne({ userId, status: 'active', $or: [{ endsAt: null }, { endsAt: { $gt: new Date() } }], startsAt: { $lte: new Date() } }).session(session);
        if (membership) organization = await Organization.findOne({ _id: membership.organizationId, status: 'active' }).session(session);
      }
      if (!organization) throw Object.assign(new Error('Choose an active commercial organization or explicitly create one before approval'), { status: 409 });
      if (choice.organizationId || choice.newOrganizationName) await Membership.findOneAndUpdate({ userId, organizationId: organization._id }, { $set: { role: choice.role, propertyAccess: 'all', permissionMode: 'role_default', permissions: {}, status: 'active', startsAt: new Date(), createdBy: actorUserId }, $unset: { endsAt: 1, revokedAt: 1 } }, { upsert: true, new: true, session, runValidators: true });
      user.role = 'commercial'; user.isActive = true; await user.save({ session });
      await Audit.create([{ organizationId: organization._id, actorUserId, subjectUserId: user._id, action: 'commercial_user_approved', summary: 'Staff approved commercial account access.', metadata: { membershipRole: choice.role, explicitlyLinked: Boolean(choice.organizationId || choice.newOrganizationName) } }], { session });
    });
    return user;
  } finally { await session.endSession(); }
}
module.exports = { approveCommercialUser, parseOrganizationChoice };
