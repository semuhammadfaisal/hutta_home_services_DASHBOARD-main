const mongoose = require('mongoose');
require('dotenv').config();

async function fixVendorModel() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        
        // Drop the vendors collection to reset schema
        await mongoose.connection.db.dropCollection('vendors').catch(() => {
            console.log('Vendors collection does not exist, skipping drop');
        });
        
        console.log('Vendors collection dropped successfully');
        console.log('Please restart your server');
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

fixVendorModel();
