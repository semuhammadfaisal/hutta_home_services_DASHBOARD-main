const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const User = require('./models/User');
const { revokeUserSessions } = require('./utils/authSessions');

async function assignRole() {
  const email = String(process.env.ROLE_USER_EMAIL || '').trim().toLowerCase();
  const role = String(process.env.ROLE_USER_ROLE || '').trim();
  if (!email || !['admin', 'manager', 'account_rep'].includes(role)) {
    throw new Error('ROLE_USER_EMAIL and a valid ROLE_USER_ROLE are required');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOne({ email });
  if (!user) throw new Error('User not found');
  user.role = role;
  user.isActive = true;
  await user.save();
  await revokeUserSessions(user._id);
  console.log(`Assigned ${role} to ${email}; existing sessions were revoked.`);
}

assignRole()
  .catch(error => {
    console.error('Role assignment failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
