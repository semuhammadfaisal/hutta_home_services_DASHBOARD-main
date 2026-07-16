const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const User = require('./models/User');
const { revokeUserSessions } = require('./utils/authSessions');

async function resetPassword() {
  const email = String(process.env.RESET_USER_EMAIL || '').trim().toLowerCase();
  const newPassword = String(process.env.RESET_USER_PASSWORD || '');
  if (!email || newPassword.length < 12) {
    throw new Error('RESET_USER_EMAIL and RESET_USER_PASSWORD (minimum 12 characters) are required');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOne({ email });
  if (!user) throw new Error('User not found');
  user.password = newPassword;
  await user.save();
  await revokeUserSessions(user._id);
  console.log('Password reset and existing sessions revoked for:', email);
}

resetPassword()
  .catch(error => {
    console.error('Password reset failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
