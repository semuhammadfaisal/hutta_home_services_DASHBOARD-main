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
const router = express.Router();

const noteOwnerModels = [
  require('../models/Order'),
  require('../models/Customer'),
  require('../models/Vendor'),
  require('../models/Payment'),
  require('../models/PipelineRecord'),
  require('../models/Project')
];

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
    res.set('Cache-Control', 'no-store').json(authenticateToken.sessionPayload(req));
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Signup (public user registration)
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, requestedRole } = req.body;
    
    if (!name || !email || !password || !requestedRole) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    if (!['admin', 'manager', 'account_rep'].includes(requestedRole)) {
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

// Update profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { email, firstName, lastName, phone, department, avatar } = req.body;

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const previousEmail = user.email;
    user.email = String(email || '').trim().toLowerCase();
    user.firstName = String(firstName || '').trim();
    user.lastName = String(lastName || '').trim();
    user.phone = phone;
    user.department = department;
    user.avatar = avatar;
    await user.save();

    await syncNoteAuthorNames(user, previousEmail);

    res.json({ message: 'Profile updated successfully', user: getUserPayload(user) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Email already registered' });
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
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters' });
    }
    if (!(await req.authUser.comparePassword(currentPassword))) {
      return res.status(400).json({ message: 'Current password is incorrect' });
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
