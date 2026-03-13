const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');

async function assignRoles() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all users
    const users = await User.find();
    
    if (users.length === 0) {
      console.log('❌ No users found in database');
      await mongoose.disconnect();
      return;
    }

    console.log('📋 Current Users:\n');
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email} - Role: ${user.role || 'NO ROLE'}`);
    });

    console.log('\n─────────────────────────────────────────');
    console.log('Available Roles:');
    console.log('  admin        - Full access to everything');
    console.log('  manager      - Operations only (no financial)');
    console.log('  account_rep  - Sales focus (limited access)');
    console.log('─────────────────────────────────────────\n');

    // Example: Assign roles to specific users
    // EDIT THESE LINES TO ASSIGN ROLES TO YOUR USERS:
    
    // Method 1: Assign by email
    await assignRoleByEmail('your-email@example.com', 'admin');
    
    // Method 2: Assign to all users without role
    await assignDefaultRole('account_rep');
    
    // Method 3: Make first user admin
    await makeFirstUserAdmin();

    console.log('\n✅ Role assignment complete!');
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Assign role to specific user by email
async function assignRoleByEmail(email, role) {
  const user = await User.findOne({ email });
  if (user) {
    user.role = role;
    await user.save();
    console.log(`✅ Assigned ${role} to ${email}`);
  } else {
    console.log(`⚠️  User ${email} not found`);
  }
}

// Assign default role to users without role
async function assignDefaultRole(defaultRole) {
  const usersWithoutRole = await User.find({ 
    $or: [{ role: null }, { role: { $exists: false } }] 
  });
  
  for (const user of usersWithoutRole) {
    user.role = defaultRole;
    await user.save();
    console.log(`✅ Assigned ${defaultRole} to ${user.email}`);
  }
}

// Make first user admin
async function makeFirstUserAdmin() {
  const firstUser = await User.findOne().sort({ createdAt: 1 });
  if (firstUser && firstUser.role !== 'admin') {
    firstUser.role = 'admin';
    await firstUser.save();
    console.log(`✅ Made ${firstUser.email} an admin`);
  }
}

assignRoles();
