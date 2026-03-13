const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const User = require('./models/User');

async function createFirstAdmin() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@huttas.com' });
    
    if (existingAdmin) {
      console.log('⚠️  Admin user already exists!');
      console.log('📧 Email:', existingAdmin.email);
      console.log('👤 Name:', `${existingAdmin.firstName} ${existingAdmin.lastName}`);
      console.log('🔑 Role:', existingAdmin.role);
      console.log('\n💡 If you want to reset the password, delete this user first.');
      
      await mongoose.connection.close();
      process.exit(0);
      return;
    }

    console.log('👤 Creating first admin user...\n');

    // Create admin user
    const adminUser = new User({
      email: 'admin@huttas.com',
      password: 'huttasAdmin#457583sset4',
      firstName: 'Admin',
      lastName: 'Hutta',
      role: 'admin',
      phone: '',
      department: 'Administration',
      isActive: true
    });

    await adminUser.save();

    console.log('✅ Admin user created successfully!\n');
    console.log('📧 Email: admin@huttas.com');
    console.log('🔒 Password: huttasAdmin#457583sset4');
    console.log('🔑 Role: admin');
    console.log('\n💡 You can now login to the dashboard with these credentials.');
    console.log('🔐 Make sure to keep these credentials secure!');

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
    process.exit(0);
  }
}

// Run the script
createFirstAdmin();
