const mongoose = require('mongoose');
const Stage = require('./models/Stage');

require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB\n');
    
    const lostStage = await Stage.findOne({ name: 'Lost' });
    
    if (!lostStage) {
      console.log(' LOST stage not found in database');
      console.log('Available stages:');
      const allStages = await Stage.find();
      allStages.forEach(s => console.log(`  - ${s.name}`));
    } else {
      console.log('LOST Stage Status:');
      console.log(`  Name: ${lostStage.name}`);
      console.log(`  isNoBid: ${lostStage.isNoBid || false}`);
      console.log(`  ID: ${lostStage._id}`);
      
      if (!lostStage.isNoBid) {
        console.log('\n  LOST stage is NOT marked as NO BID!');
        console.log('Run: node mark-stage-as-no-bid.js "Lost"');
      } else {
        console.log('\n LOST stage is correctly marked as NO BID');
      }
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
