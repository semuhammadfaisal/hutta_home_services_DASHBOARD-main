const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const PipelineRecord = require('./models/PipelineRecord');
const Order = require('./models/Order');

// MongoDB connection string from .env
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not found in .env file');
    process.exit(1);
}

async function migratePipelineOrderIds() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Get all pipeline records that have an orderId but no orderIdDisplay
        const records = await PipelineRecord.find({ 
            orderId: { $exists: true, $ne: null },
            $or: [
                { orderIdDisplay: { $exists: false } },
                { orderIdDisplay: null },
                { orderIdDisplay: '' }
            ]
        });

        console.log(`Found ${records.length} pipeline records to update`);

        if (records.length === 0) {
            console.log('✅ No records need updating. All done!');
            return;
        }

        let updated = 0;
        let skipped = 0;

        for (const record of records) {
            try {
                // Fetch the order to get the orderId field
                const order = await Order.findById(record.orderId);
                
                if (order && order.orderId) {
                    record.orderIdDisplay = order.orderId;
                    await record.save();
                    console.log(`✓ Updated record ${record._id} with orderIdDisplay: ${order.orderId}`);
                    updated++;
                } else {
                    console.log(`⚠ Skipped record ${record._id} - order not found or no orderId`);
                    skipped++;
                }
            } catch (err) {
                console.error(`✗ Error updating record ${record._id}:`, err.message);
                skipped++;
            }
        }

        console.log('\n=== Migration Complete ===');
        console.log(`✅ Updated: ${updated}`);
        console.log(`⚠ Skipped: ${skipped}`);
        console.log(`📊 Total: ${records.length}`);

    } catch (error) {
        console.error('❌ Migration error:', error.message);
    } finally {
        await mongoose.connection.close();
        console.log('Database connection closed');
    }
}

// Run the migration
migratePipelineOrderIds();
