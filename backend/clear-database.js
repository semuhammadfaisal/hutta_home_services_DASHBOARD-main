const mongoose = require('mongoose');
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

async function clearDatabase() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('⚠️  WARNING: This will delete ALL data from the database!');
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

    Object.entries(counts).forEach(([collection, count]) => {
      console.log(`   ${collection}: ${count}`);
    });

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

    console.log('\n✨ Database cleared successfully!');
    console.log('💡 Note: You may want to run "node make-first-user-admin.js" to create an admin user');

  } catch (error) {
    console.error('❌ Error clearing database:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
    process.exit(0);
  }
}

// Run the script
clearDatabase();
