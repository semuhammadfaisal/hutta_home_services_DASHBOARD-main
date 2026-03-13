const mongoose = require('mongoose');
const readline = require('readline');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Import all models
const User = require('./models/User');
const Order = require('./models/Order');
const Customer = require('./models/Customer');
const Vendor = require('./models/Vendor');
const Employee = require('./models/Employee');
const Payment = require('./models/Payment');
const Project = require('./models/Project');
const Settings = require('./models/Settings');
const Notification = require('./models/Notification');
const PipelineRecord = require('./models/PipelineRecord');
const PipelineMovement = require('./models/PipelineMovement');
const Stage = require('./models/Stage');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function resetDatabase() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('📊 Current data count:');

    // Show current counts
    const counts = {
      Users: await User.countDocuments(),
      Orders: await Order.countDocuments(),
      Customers: await Customer.countDocuments(),
      Vendors: await Vendor.countDocuments(),
      Employees: await Employee.countDocuments(),
      Payments: await Payment.countDocuments(),
      Projects: await Project.countDocuments(),
      Settings: await Settings.countDocuments(),
      Notifications: await Notification.countDocuments(),
      PipelineRecords: await PipelineRecord.countDocuments(),
      PipelineMovements: await PipelineMovement.countDocuments(),
      Stages: await Stage.countDocuments()
    };

    let totalRecords = 0;
    Object.entries(counts).forEach(([collection, count]) => {
      console.log(`   ${collection}: ${count}`);
      totalRecords += count;
    });

    console.log(`\n   📈 Total Records: ${totalRecords}\n`);

    console.log('⚠️  WARNING: This will PERMANENTLY delete ALL data and create a fresh admin user!');
    console.log('⚠️  This action CANNOT be undone!\n');

    const answer = await askQuestion('Type "RESET" to confirm (or anything else to cancel): ');

    if (answer.trim() === 'RESET') {
      console.log('\n🗑️  Clearing all collections...\n');

      // Delete all documents from each collection
      await User.deleteMany({});
      console.log('✅ Cleared Users');

      await Order.deleteMany({});
      console.log('✅ Cleared Orders');

      await Customer.deleteMany({});
      console.log('✅ Cleared Customers');

      await Vendor.deleteMany({});
      console.log('✅ Cleared Vendors');

      await Employee.deleteMany({});
      console.log('✅ Cleared Employees');

      await Payment.deleteMany({});
      console.log('✅ Cleared Payments');

      await Project.deleteMany({});
      console.log('✅ Cleared Projects');

      await Settings.deleteMany({});
      console.log('✅ Cleared Settings');

      await Notification.deleteMany({});
      console.log('✅ Cleared Notifications');

      await PipelineRecord.deleteMany({});
      console.log('✅ Cleared Pipeline Records');

      await PipelineMovement.deleteMany({});
      console.log('✅ Cleared Pipeline Movements');

      await Stage.deleteMany({});
      console.log('✅ Cleared Stages');

      console.log('\n👤 Creating admin user...\n');

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
      console.log('═══════════════════════════════════════════');
      console.log('✨ Database Reset Complete!');
      console.log('═══════════════════════════════════════════');
      console.log('📧 Email:    admin@huttas.com');
      console.log('🔒 Password: huttasAdmin#457583sset4');
      console.log('🔑 Role:     admin');
      console.log('═══════════════════════════════════════════');
      console.log('\n💡 You can now login to the dashboard with these credentials.');
      console.log('🔐 IMPORTANT: Keep these credentials secure!');
      
    } else {
      console.log('\n❌ Operation cancelled. No data was deleted.');
    }

  } catch (error) {
    console.error('❌ Error resetting database:', error);
  } finally {
    rl.close();
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
    process.exit(0);
  }
}

// Run the script
resetDatabase();
