const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');

async function testRBAC() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Create test users for each role
    const testUsers = [
      {
        email: 'admin@test.com',
        password: 'admin123',
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin'
      },
      {
        email: 'manager@test.com',
        password: 'manager123',
        firstName: 'Manager',
        lastName: 'User',
        role: 'manager'
      },
      {
        email: 'rep@test.com',
        password: 'rep123',
        firstName: 'Account',
        lastName: 'Representative',
        role: 'account_rep'
      }
    ];

    console.log('\n📝 Creating test users...\n');

    for (const userData of testUsers) {
      const existing = await User.findOne({ email: userData.email });
      
      if (existing) {
        console.log(`⚠️  User ${userData.email} already exists - updating role to ${userData.role}`);
        existing.role = userData.role;
        await existing.save();
      } else {
        const user = new User(userData);
        await user.save();
        console.log(`✅ Created ${userData.role}: ${userData.email} / ${userData.password.replace(/./g, '*')}`);
      }
    }

    console.log('\n✅ RBAC Test Users Created Successfully!\n');
    console.log('Test Credentials:');
    console.log('─────────────────────────────────────────');
    console.log('Admin:      admin@test.com / admin123');
    console.log('Manager:    manager@test.com / manager123');
    console.log('Account Rep: rep@test.com / rep123');
    console.log('─────────────────────────────────────────\n');

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testRBAC();
