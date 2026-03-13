const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');

async function makeFirstUserAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Get all users
    const users = await User.find().sort({ createdAt: 1 });
    
    if (users.length === 0) {
      console.log('❌ No users found in database');
      console.log('💡 Create a user by signing up first, then run this script again\n');
      await mongoose.disconnect();
      return;
    }
    
    console.log(`📋 Found ${users.length} user(s) in database:\n`);
    
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email}`);
      console.log(`   Name: ${user.firstName} ${user.lastName}`);
      console.log(`   Current Role: ${user.role}`);
      console.log(`   Created: ${user.createdAt.toLocaleDateString()}\n`);
    });
    
    // Get first user
    const firstUser = users[0];
    
    if (firstUser.role === 'admin') {
      console.log(`✅ First user (${firstUser.email}) is already an admin!\n`);
    } else {
      console.log(`🔄 Making first user (${firstUser.email}) an admin...\n`);
      
      firstUser.role = 'admin';
      await firstUser.save();
      
      console.log(`✅ SUCCESS! ${firstUser.email} is now an admin!\n`);
      console.log('⚠️  IMPORTANT: User must logout and login again to see admin permissions\n');
    }
    
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

makeFirstUserAdmin();
