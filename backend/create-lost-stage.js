const mongoose = require('mongoose');
const Stage = require('./models/Stage');

async function createLostStage() {
  try {
    require('dotenv').config();
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Check if Lost stage exists
    let lostStage = await Stage.findOne({ name: 'Lost' });
    
    if (lostStage) {
      console.log('Lost stage already exists');
      if (!lostStage.isNoBid) {
        lostStage.isNoBid = true;
        await lostStage.save();
        console.log('✅ Marked Lost stage as NO BID');
      } else {
        console.log('✅ Lost stage already marked as NO BID');
      }
    } else {
      // Get highest position
      const stages = await Stage.find().sort({ position: -1 }).limit(1);
      const maxPosition = stages.length > 0 ? stages[0].position : 0;
      
      // Create Lost stage
      lostStage = new Stage({
        name: 'Lost',
        position: maxPosition + 1,
        description: 'Lost opportunities - excluded from KPIs',
        isNoBid: true
      });
      
      await lostStage.save();
      console.log('✅ Created Lost stage as NO BID');
      console.log(`   Position: ${lostStage.position}`);
      console.log(`   ID: ${lostStage._id}`);
    }
    
    console.log('\n✅ Done! Restart your server and refresh browser.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createLostStage();
