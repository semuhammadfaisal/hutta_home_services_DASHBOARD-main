const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const authenticateToken = require('../middleware/auth');
const {
  clearSessionCookie,
  createSession,
  revokeSession,
  revokeUserSessions
} = require('../utils/authSessions');
const { sendPasswordResetEmail } = require('../utils/emailService');
const AgentClientInvitation = require('../models/AgentClientInvitation');
const { hashInvitationToken } = require('../utils/agentAccess');
const CommercialUserInvitation = require('../models/CommercialUserInvitation');
const { hashToken: hashCommercialInvitationToken } = require('../utils/commercialPermissions');
const Vendor = require('../models/Vendor');
const VendorPortalMembership = require('../models/VendorPortalMembership');
const router = express.Router();

const noteOwnerModels = [
  require('../models/Order'),
  require('../models/Customer'),
  require('../models/Vendor'),
  require('../models/Payment'),
  require('../models/PipelineRecord'),
  require('../models/Project')
];

const PROFILE_LIMITS = Object.freeze({
  firstName: 80,
  lastName: 80,
  email: 254,
  phone: 40,
  department: 100,
  avatarBytes: 512 * 1024
});

function profileError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeProfileText(value, fieldName, maxLength, { required = false } = {}) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (required && !normalized) throw profileError(`${fieldName} is required`);
  if (normalized.length > maxLength) {
    throw profileError(`${fieldName} must be ${maxLength} characters or fewer`);
  }
  return normalized;
}

function normalizeProfileAvatar(value) {
  if (value === '' || value === null) return '';
  if (typeof value !== 'string') throw profileError('Profile photo is invalid');

  const match = value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) throw profileError('Profile photo must be a PNG, JPEG, or WebP image');

  const encoded = match[2].replace(/\s/g, '');
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw profileError('Profile photo data is invalid');
  }

  const imageBuffer = Buffer.from(encoded, 'base64');
  if (!imageBuffer.length || imageBuffer.length > PROFILE_LIMITS.avatarBytes) {
    throw profileError('Profile photo must be 512 KB or smaller');
  }

  return `data:image/${match[1].toLowerCase()};base64,${encoded}`;
}

function getUserPayload(user) {
  return {
    id: user._id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    phone: user.phone,
    department: user.department,
    avatar: user.avatar
  };
}

async function syncNoteAuthorNames(user, previousEmail) {
  const userId = user._id;
  const currentEmail = user.email;
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || currentEmail || 'Unknown User';
  const emailMatches = [...new Set([previousEmail, currentEmail].filter(Boolean))];
  const updates = [];

  noteOwnerModels.forEach(Model => {
    updates.push(Model.updateMany(
      { 'notesHistory.createdBy': userId },
      { $set: { 'notesHistory.$[note].createdByName': displayName } },
      { arrayFilters: [{ 'note.createdBy': userId }] }
    ));

    if (emailMatches.length) {
      updates.push(Model.updateMany(
        { 'notesHistory.createdByEmail': { $in: emailMatches } },
        {
          $set: {
            'notesHistory.$[note].createdByName': displayName,
            'notesHistory.$[note].createdByEmail': currentEmail
          }
        },
        { arrayFilters: [{ 'note.createdByEmail': { $in: emailMatches } }] }
      ));
    }

    updates.push(Model.updateMany(
      { 'notesHistory.edits.editedBy': userId },
      { $set: { 'notesHistory.$[].edits.$[edit].editedByName': displayName } },
      { arrayFilters: [{ 'edit.editedBy': userId }] }
    ));
  });

  await Promise.all(updates);
}

// Login
router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ email, isActive: true, role: { $ne: 'pending' } });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const session = await createSession(user, res);
    req.authSession = session;
    req.authUser = user;
    res.set('Cache-Control', 'no-store').json(authenticateToken.sessionPayload(req, req.body.returnTo));
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Signup (public user registration)
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, requestedRole } = req.body;
    const requestedPortal = req.body.requestedPortal || 'crm';
    const externalRoles = ['residential', 'real_estate_agent', 'commercial'];
    if (!['crm', ...externalRoles].includes(requestedPortal) || (requestedPortal !== 'crm' && requestedRole !== requestedPortal)) {
      return res.status(400).json({ message: 'Invalid requested portal or role' });
    }
    
    if (!name || !email || !password || !requestedRole) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    if (requestedPortal === 'crm' ? !['admin', 'manager', 'account_rep'].includes(requestedRole) : !externalRoles.includes(requestedRole)) {
      return res.status(400).json({ message: 'Invalid requested role' });
    }
    
    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const [firstName, ...lastNameParts] = name.split(' ');
    const lastName = lastNameParts.join(' ') || firstName;

    const user = new User({
      email: normalizedEmail,
      password,
      firstName, 
      lastName,
      role: 'pending',
      requestedRole,
      requestedPortal,
      isActive: false
    });
    await user.save();

    res.status(201).json({ 
      message: 'Account created successfully',
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        requestedRole: user.requestedRole
      }
    });
  } catch (error) {
    console.error('Signup error details:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Vendor self-registration creates one login-to-vendor membership. Compliance is completed in the portal.
router.post('/vendor-signup', async (req, res) => {
  try {
    const companyName = normalizeProfileText(req.body.companyName, 'Company name', 160, { required: true });
    const contactName = normalizeProfileText(req.body.contactName, 'Contact name', 160, { required: true });
    const email = normalizeProfileText(req.body.email, 'Email address', PROFILE_LIMITS.email, { required: true }).toLowerCase();
    const password = String(req.body.password || '');
    const phone = normalizeProfileText(req.body.phone, 'Phone number', PROFILE_LIMITS.phone, { required: true });
    const entityType = normalizeProfileText(req.body.entityType, 'Entity type', 80, { required: true });
    const trades = [...new Set((Array.isArray(req.body.tradeClassifications) ? req.body.tradeClassifications : []).map(value => String(value || '').trim()).filter(Boolean))].slice(0, 30);
    const licensedTrade = req.body.licensedTrade === true;
    const rocLicenseNumber = String(req.body.rocLicenseNumber || '').trim().slice(0, 100);
    const serviceArea = req.body.serviceArea || {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || !trades.length) return res.status(400).json({ message: 'Valid email, password of at least 8 characters, and at least one trade classification are required' });
    if (licensedTrade && !rocLicenseNumber) return res.status(400).json({ message: 'ROC license number is required for licensed trades' });
    if (await User.exists({ email })) return res.status(409).json({ message: 'An account already exists for this email' });
    if (await Vendor.exists({ $or: [{ email }, ...(rocLicenseNumber ? [{ rocLicenseNumber }] : [])] })) return res.status(409).json({ message: 'A vendor application already exists for this email or ROC license' });
    const [firstName, ...lastParts] = contactName.split(/\s+/);
    const vendor = await Vendor.create({
      name: companyName, legalBusinessName: String(req.body.legalBusinessName || companyName).trim().slice(0, 200), primaryOwnerName: contactName,
      email, phone, businessEntityType: entityType, businessAddress: String(req.body.businessAddress || '').trim().slice(0, 500),
      category: trades[0], tradeClassifications: trades, licensedTrade, rocLicenseNumber,
      rocLicenseTypeClassification: String(req.body.rocClassification || '').trim().slice(0, 160),
      serviceArea: { basePostalCode: String(serviceArea.basePostalCode || '').trim().slice(0, 20), radiusMiles: Math.max(0, Math.min(500, Number(serviceArea.radiusMiles || 0))), counties: (Array.isArray(serviceArea.counties) ? serviceArea.counties : []).slice(0, 30), postalCodes: (Array.isArray(serviceArea.postalCodes) ? serviceArea.postalCodes : []).slice(0, 100) },
      onboardingSource: 'self_signup', onboardingStatus: 'pending_review', portalStatus: 'compliance_incomplete', portalStatusUpdatedAt: new Date(), isActive: false,
      onboardingHistory: [{ action: 'submitted', message: 'Vendor created a portal account and started compliance onboarding', createdAt: new Date() }]
    });
    let user;
    try {
      user = await User.create({ email, password, firstName, lastName: lastParts.join(' ') || firstName, phone, role: 'vendor', isActive: true });
      await VendorPortalMembership.create({ userId: user._id, vendorId: vendor._id, role: 'owner', permissions: { profile: true, compliance: true, team: true, assignments: true, invoices: true } });
    } catch (error) {
      if (user?._id) await User.deleteOne({ _id: user._id }).catch(() => {});
      await Vendor.deleteOne({ _id: vendor._id, onboardingSource: 'self_signup' }).catch(() => {});
      throw error;
    }
    const session = await createSession(user, res); req.authSession = session; req.authUser = user;
    res.status(201).set('Cache-Control', 'no-store').json(authenticateToken.sessionPayload(req, '/pages/vendor-portal.html'));
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'This vendor login or vendor record already exists' });
    res.status(error?.statusCode || (error?.name === 'ValidationError' ? 400 : 500)).json({ message: error?.message || 'Vendor account creation failed' });
  }
});

// Residential signup is available only to the homeowner named by an active agent invitation.
// The password is accepted and hashed by User; it is never written to invitation/customer records.
router.post('/residential-invite-signup', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim(); const email = String(req.body?.email || '').trim().toLowerCase(); const password = String(req.body?.password || ''); const token = String(req.body?.token || '');
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || !/^[A-Za-z0-9_-]{32,100}$/.test(token)) return res.status(400).json({ message: 'Name, valid email, password of at least 8 characters, and invitation token are required' });
    const invitation = await AgentClientInvitation.findOne({ tokenHash: hashInvitationToken(token), homeownerEmail: email, status: 'pending', expiresAt: { $gt: new Date() } }).lean();
    if (!invitation) return res.status(410).json({ message: 'This invitation is invalid, expired, revoked, already used, or belongs to another email' });
    const existing = await User.findOne({ email }).lean();
    if (existing) return res.status(409).json({ message: 'An account already exists for this email. Sign in to continue.', code: 'EXISTING_ACCOUNT' });
    const [firstName, ...parts] = name.split(/\s+/); const lastName = parts.join(' ') || firstName;
    const user = await User.create({ email, password, firstName, lastName, role: 'residential', isActive: true });
    const session = await createSession(user, res); req.authSession = session; req.authUser = user;
    res.status(201).set('Cache-Control', 'no-store').json(authenticateToken.sessionPayload(req, '/pages/agent-invitation.html'));
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'An account already exists for this email. Sign in to continue.', code: 'EXISTING_ACCOUNT' });
    console.error('Residential invitation signup error:', error?.name || 'Error', error?.message || '');
    res.status(error?.name === 'ValidationError' ? 400 : 500).json({ message: error?.name === 'ValidationError' ? error.message : 'Account creation failed' });
  }
});

router.post('/commercial-invitation/preview', async (req, res) => {
  try {
    const token = String(req.body?.token || '');
    if (!/^[A-Za-z0-9_-]{32,100}$/.test(token)) return res.status(400).json({ message: 'Invitation token is required' });
    const invitation = await CommercialUserInvitation.findOne({ tokenHash: hashCommercialInvitationToken(token), status: 'pending', expiresAt: { $gt: new Date() } }).lean();
    if (!invitation) return res.status(410).json({ message: 'This invitation is invalid, expired, revoked, or already used' });
    res.json({ invitation: { email: invitation.email, scopeType: invitation.scopeType, role: invitation.role, permissions: invitation.permissions, expiresAt: invitation.expiresAt }, existingAccount: Boolean(await User.exists({ email: invitation.email })) });
  } catch (_error) { res.status(500).json({ message: 'Invitation could not be loaded' }); }
});

router.post('/commercial-invite-signup', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim(); const email = String(req.body?.email || '').trim().toLowerCase(); const password = String(req.body?.password || ''); const token = String(req.body?.token || '');
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || !/^[A-Za-z0-9_-]{32,100}$/.test(token)) return res.status(400).json({ message: 'Name, matching email, password of at least 8 characters, and invitation token are required' });
    const invitation = await CommercialUserInvitation.findOne({ tokenHash: hashCommercialInvitationToken(token), email, status: 'pending', expiresAt: { $gt: new Date() } }).lean();
    if (!invitation) return res.status(410).json({ message: 'This invitation is invalid, expired, revoked, used, or belongs to another email' });
    if (await User.exists({ email })) return res.status(409).json({ message: 'An account already exists. Sign in to accept this invitation.', code: 'EXISTING_ACCOUNT' });
    const [firstName, ...parts] = name.split(/\s+/); const user = await User.create({ email, password, firstName, lastName: parts.join(' ') || firstName, role: 'commercial', isActive: true });
    const session = await createSession(user, res); req.authSession = session; req.authUser = user;
    res.status(201).set('Cache-Control', 'no-store').json(authenticateToken.sessionPayload(req, '/pages/commercial-invitation.html'));
  } catch (error) { if (error?.code === 11000) return res.status(409).json({ message: 'An account already exists. Sign in to continue.', code: 'EXISTING_ACCOUNT' }); res.status(500).json({ message: 'Commercial account creation failed' }); }
});

// Read the current profile from the database instead of relying on cached browser data.
router.get('/profile', authenticateToken, (req, res) => {
  res.set('Cache-Control', 'no-store').json({ user: getUserPayload(req.authUser) });
});

// Update profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const email = normalizeProfileText(req.body.email, 'Email address', PROFILE_LIMITS.email, { required: true }).toLowerCase();
    const firstName = normalizeProfileText(req.body.firstName, 'First name', PROFILE_LIMITS.firstName, { required: true });
    const lastName = normalizeProfileText(req.body.lastName, 'Last name', PROFILE_LIMITS.lastName, { required: true });
    const phone = normalizeProfileText(req.body.phone, 'Phone number', PROFILE_LIMITS.phone);
    const department = normalizeProfileText(req.body.department, 'Department', PROFILE_LIMITS.department);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw profileError('Enter a valid email address');
    }

    const previousEmail = user.email;
    if (email !== previousEmail) {
      const currentPassword = String(req.body.currentPassword || '');
      if (!currentPassword || !(await user.comparePassword(currentPassword))) {
        throw profileError('Current password is required to change your email address');
      }
    }

    user.email = email;
    user.firstName = firstName;
    user.lastName = lastName;
    user.phone = phone;
    user.department = department;
    if (Object.prototype.hasOwnProperty.call(req.body, 'avatar')) {
      user.avatar = normalizeProfileAvatar(req.body.avatar);
    }
    await user.save();

    await syncNoteAuthorNames(user, previousEmail);

    res.set('Cache-Control', 'no-store').json({
      message: 'Profile updated successfully',
      user: getUserPayload(user)
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Email already registered' });
    }
    if (error.statusCode || error.name === 'ValidationError') {
      return res.status(error.statusCode || 400).json({ message: error.message });
    }
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = await User.findOne({ email, isActive: true });
    
    if (!user) {
      return res.json({ message: 'If email exists, reset link sent' });
    }
    
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour
    
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpiry = resetTokenExpiry;
    await user.save();
    
    await sendPasswordResetEmail(email, resetToken);
    
    res.json({ message: 'If email exists, reset link sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpiry: { $gt: Date.now() },
      isActive: true
    });
    
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }
    
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpiry = undefined;
    await user.save();
    await revokeUserSessions(user._id);
    
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/session', authenticateToken, (req, res) => {
  res.set('Cache-Control', 'no-store').json(authenticateToken.sessionPayload(req));
});

router.post('/logout', authenticateToken, async (req, res, next) => {
  try {
    await revokeSession(req.authSession);
    clearSessionCookie(res);
    res.set('Cache-Control', 'no-store').status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post('/change-password', authenticateToken, async (req, res, next) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({ message: 'New password must be between 8 and 128 characters' });
    }
    if (!(await req.authUser.comparePassword(currentPassword))) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    if (await req.authUser.comparePassword(newPassword)) {
      return res.status(400).json({ message: 'New password must be different from your current password' });
    }

    req.authUser.password = newPassword;
    await req.authUser.save();
    await revokeUserSessions(req.authUser._id);
    clearSessionCookie(res);
    res.json({ message: 'Password changed. Please sign in again.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
