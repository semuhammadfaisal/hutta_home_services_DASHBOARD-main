const mongoose = require('mongoose');
const Stage = require('./models/Stage');

// Load environment variables
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hutta_home_services';

async function createNoBidStage() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Check if NO BID stage already exists
        const existingNoBid = await Stage.findOne({ name: 'NO BID' });
        if (existingNoBid) {
            console.log('⚠️  NO BID stage already exists');
            console.log('Stage details:', {
                name: existingNoBid.name,
                position: existingNoBid.position,
                isNoBid: existingNoBid.isNoBid
            });
            
            // Update it to ensure isNoBid is true
            if (!existingNoBid.isNoBid) {
                existingNoBid.isNoBid = true;
                await existingNoBid.save();
                console.log('✅ Updated existing stage to mark as NO BID');
            }
        } else {
            // Get the highest position
            const stages = await Stage.find().sort({ position: -1 }).limit(1);
            const nextPosition = stages.length > 0 ? stages[0].position + 1 : 1;

            // Create new NO BID stage
            const noBidStage = new Stage({
                name: 'NO BID',
                position: nextPosition,
                description: 'Orders that are lost, declined, or not pursued',
                isNoBid: true
            });

            await noBidStage.save();
            console.log('✅ NO BID stage created successfully!');
            console.log('Stage details:', {
                name: noBidStage.name,
                position: noBidStage.position,
                isNoBid: noBidStage.isNoBid
            });
        }

        // List all stages
        console.log('\n📋 All stages in database:');
        const allStages = await Stage.find().sort({ position: 1 });
        allStages.forEach(stage => {
            const noBidIndicator = stage.isNoBid ? '🚫' : '  ';
            console.log(`${noBidIndicator} ${stage.position}. ${stage.name} (isNoBid: ${stage.isNoBid || false})`);
        });

        console.log('\n✅ Done! Restart your server and refresh the browser.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

createNoBidStage();
