const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const authenticateToken = require('../middleware/auth');
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

function signUserToken(user) {
  return jwt.sign(
    { userId: user._id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
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
    const { email, password } = req.body;
    
    // For demo: accept any credentials if no users exist
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      // No users in DB, create demo response
      const token = jwt.sign(
        { userId: 'demo-user', email: email, role: 'admin', firstName: 'Admin', lastName: 'User' },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      return res.json({
        token,
        user: {
          id: 'demo-user',
          email: email,
          firstName: 'Admin',
          lastName: 'User',
          role: 'admin'
        }
      });
    }
    
    const user = await User.findOne({ email, isActive: true });
    if (!user) {
      console.log('User not found:', email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    const isPasswordValid = await user.comparePassword(password);
    console.log('Password validation result:', isPasswordValid);
    
    if (!isPasswordValid) {
      console.log('Invalid password for user:', email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = signUserToken(user);

    res.json({
      token,
      user: getUserPayload(user)
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Register (for creating admin users)
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, role } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = new User({ email, password, firstName, lastName, role });
    await user.save();

    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Signup (public user registration)
router.post('/signup', async (req, res) => {
  try {
    console.log('Signup request received:', req.body);
    const { name, email, password, requestedRole } = req.body;
    
    if (!name || !email || !password || !requestedRole) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const [firstName, ...lastNameParts] = name.split(' ');
    const lastName = lastNameParts.join(' ') || firstName;

    console.log('Creating user:', { email, firstName, lastName, role: 'pending', requestedRole });

    const user = new User({ 
      email, 
      password, 
      firstName, 
      lastName,
      role: 'pending',
      requestedRole
    });
    await user.save();

    console.log('User created successfully:', user._id);

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
    res.status(500).json({ message: error.message || 'Server error' });
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
    user.email = String(email || '').trim();
    user.firstName = String(firstName || '').trim();
    user.lastName = String(lastName || '').trim();
    user.phone = phone;
    user.department = department;
    user.avatar = avatar;
    await user.save();

    await syncNoteAuthorNames(user, previousEmail);

    const token = signUserToken(user);
    res.json({ message: 'Profile updated successfully', token, user: getUserPayload(user) });
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
    const { email } = req.body;
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
    
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
