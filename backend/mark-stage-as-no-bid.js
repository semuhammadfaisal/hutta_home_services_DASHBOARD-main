const mongoose = require('mongoose');
const Stage = require('./models/Stage');

require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hutta_home_services';

async function markStageAsNoBid() {
    const stageName = process.argv[2];
    
    if (!stageName) {
        console.log('❌ Usage: node mark-stage-as-no-bid.js "Stage Name"');
        console.log('Example: node mark-stage-as-no-bid.js "Lost"');
        process.exit(1);
    }

    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        const stage = await Stage.findOne({ name: stageName });
        
        if (!stage) {
            console.log(`❌ Stage "${stageName}" not found`);
            console.log('\n📋 Available stages:');
            const allStages = await Stage.find().sort({ position: 1 });
            allStages.forEach(s => {
                console.log(`  - ${s.name}`);
            });
            process.exit(1);
        }

        if (stage.isNoBid) {
            console.log(`⚠️  Stage "${stageName}" is already marked as NO BID`);
        } else {
            stage.isNoBid = true;
            await stage.save();
            console.log(`✅ Marked "${stageName}" as NO BID stage`);
            console.log('\n💡 Orders in this stage will now be hidden from:');
            console.log('  - Orders tab');
            console.log('  - Payments tab');
            console.log('  - KPI calculations');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

markStageAsNoBid();
