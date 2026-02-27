const mongoose = require('mongoose');
require('dotenv').config();

const Customer = require('./models/Customer');

async function testMultipleEmailSupport() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const sharedEmail = 'test@dentalgroup.com';

    // Test 1: Create first customer
    console.log('Test 1: Creating first customer with email:', sharedEmail);
    const customer1 = new Customer({
      name: 'Dental Group - Downtown Office',
      email: sharedEmail,
      phone: '555-0101',
      address: '123 Main St',
      city: 'Springfield',
      state: 'IL',
      zipCode: '62701',
      addresses: [{
        label: 'Primary',
        address: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62701',
        isPrimary: true
      }]
    });
    await customer1.save();
    console.log('✓ Customer 1 created successfully:', customer1._id);

    // Test 2: Create second customer with same email
    console.log('\nTest 2: Creating second customer with same email:', sharedEmail);
    const customer2 = new Customer({
      name: 'Dental Group - North Branch',
      email: sharedEmail,
      phone: '555-0102',
      address: '456 Oak Ave',
      city: 'Springfield',
      state: 'IL',
      zipCode: '62702',
      addresses: [{
        label: 'Primary',
        address: '456 Oak Ave',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62702',
        isPrimary: true
      }]
    });
    await customer2.save();
    console.log('✓ Customer 2 created successfully:', customer2._id);

    // Test 3: Query customers by email
    console.log('\nTest 3: Querying customers by email:', sharedEmail);
    const customers = await Customer.find({ email: sharedEmail });
    console.log(`✓ Found ${customers.length} customers with email ${sharedEmail}`);
    customers.forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.name} - ${c.address}`);
    });

    // Test 4: Test multiple addresses on single customer
    console.log('\nTest 4: Creating customer with multiple addresses');
    const customer3 = new Customer({
      name: 'ABC Corporation',
      email: 'facilities@abc.com',
      phone: '555-0200',
      addresses: [
        {
          label: 'Headquarters',
          address: '100 Corporate Dr',
          city: 'Chicago',
          state: 'IL',
          zipCode: '60601',
          isPrimary: true
        },
        {
          label: 'Warehouse',
          address: '200 Industrial Pkwy',
          city: 'Chicago',
          state: 'IL',
          zipCode: '60602',
          isPrimary: false
        },
        {
          label: 'Retail Store',
          address: '300 Shopping Plaza',
          city: 'Chicago',
          state: 'IL',
          zipCode: '60603',
          isPrimary: false
        }
      ]
    });
    await customer3.save();
    console.log('✓ Customer with multiple addresses created:', customer3._id);
    console.log(`  Total addresses: ${customer3.addresses.length}`);
    customer3.addresses.forEach((addr, i) => {
      console.log(`  ${i + 1}. ${addr.label}: ${addr.address}, ${addr.city}`);
    });

    // Cleanup test data
    console.log('\nCleaning up test data...');
    await Customer.deleteMany({ 
      email: { $in: [sharedEmail, 'facilities@abc.com'] } 
    });
    console.log('✓ Test data cleaned up');

    console.log('\n✅ All tests passed successfully!');
    console.log('\nSummary:');
    console.log('- Multiple customers can share the same email address');
    console.log('- Single customer can have multiple physical addresses');
    console.log('- Database queries work correctly with duplicate emails');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

testMultipleEmailSupport();
