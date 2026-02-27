const mongoose = require('mongoose');
require('dotenv').config();

async function removeEmailUniqueIndex() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('customers');

    // Drop the unique index on email
    try {
      await collection.dropIndex('email_1');
      console.log('✓ Removed unique index on email field');
    } catch (error) {
      if (error.code === 27) {
        console.log('✓ Index does not exist (already removed)');
      } else {
        throw error;
      }
    }

    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

removeEmailUniqueIndex();
