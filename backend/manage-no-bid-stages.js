const mongoose = require('mongoose');
const Stage = require('./models/Stage');

require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hutta_home_services';

async function manageNoBidStages() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // List all stages
        console.log('📋 Current stages:');
        const allStages = await Stage.find().sort({ position: 1 });
        allStages.forEach(stage => {
            const noBidIndicator = stage.isNoBid ? '🚫 NO BID' : '✅ Normal';
            console.log(`  ${stage.position}. ${stage.name.padEnd(20)} - ${noBidIndicator}`);
        });

        // Check for NO BID stages
        const noBidStages = allStages.filter(s => s.isNoBid);
        
        if (noBidStages.length === 0) {
            console.log('\n⚠️  No NO BID stages found. Creating one...');
            
            const nextPosition = allStages.length > 0 ? Math.max(...allStages.map(s => s.position)) + 1 : 1;
            
            const noBidStage = new Stage({
                name: 'NO BID',
                position: nextPosition,
                description: 'Orders that are lost, declined, or not pursued',
                isNoBid: true
            });

            await noBidStage.save();
            console.log('✅ Created NO BID stage at position', nextPosition);
        } else {
            console.log(`\n✅ Found ${noBidStages.length} NO BID stage(s):`);
            noBidStages.forEach(stage => {
                console.log(`  - ${stage.name} (position ${stage.position})`);
            });
        }

        console.log('\n💡 How NO BID stages work:');
        console.log('  • Orders in NO BID stages are hidden from:');
        console.log('    - Orders tab');
        console.log('    - Payments tab');
        console.log('    - KPI calculations (revenue, counts, etc.)');
        console.log('  • Orders remain visible in Pipeline view');
        console.log('  • Drag orders back to normal stages to make them visible again');
        
        console.log('\n💡 To create additional NO BID stages:');
        console.log('  1. Go to Pipeline tab in dashboard');
        console.log('  2. Click "Add Stage"');
        console.log('  3. Name it "Lost", "Declined", etc.');
        console.log('  4. Run this command to mark it as NO BID:');
        console.log('     node mark-stage-as-no-bid.js "Stage Name"');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

manageNoBidStages();
