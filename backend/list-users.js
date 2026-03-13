const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');

async function listUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const users = await User.find({}, 'email role firstName lastName createdAt');
    
    console.log('\n📋 All Users in Database:\n');
    console.log('═'.repeat(80));
    console.log('Email'.padEnd(35), 'Name'.padEnd(25), 'Role');
    console.log('═'.repeat(80));
    
    if (users.length === 0) {
      console.log('No users found in database');
    } else {
      users.forEach(user => {
        const name = `${user.firstName} ${user.lastName}`;
        const role = user.role || '⚠️  NO ROLE';
        const roleColor = user.role ? role : '⚠️  NO ROLE';
        console.log(
          user.email.padEnd(35),
          name.padEnd(25),
          roleColor
        );
      });
    }
    
    console.log('═'.repeat(80));
    console.log(`\nTotal Users: ${users.length}`);
    
    // Count by role
    const adminCount = users.filter(u => u.role === 'admin').length;
    const managerCount = users.filter(u => u.role === 'manager').length;
    const repCount = users.filter(u => u.role === 'account_rep').length;
    const noRoleCount = users.filter(u => !u.role).length;
    
    console.log('\nRole Distribution:');
    console.log(`  Admins:          ${adminCount}`);
    console.log(`  Managers:        ${managerCount}`);
    console.log(`  Account Reps:    ${repCount}`);
    if (noRoleCount > 0) {
      console.log(`  ⚠️  No Role:       ${noRoleCount} (needs assignment)`);
    }
    console.log('');
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

listUsers();
