const mongoose = require('mongoose');
const Stage = require('./models/Stage');

require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const stages = await Stage.find().lean();
    
    console.log(`Found ${stages.length} stages:\n`);
    stages.forEach((s, i) => {
      console.log(`${i + 1}. "${s.name}"`);
      console.log(`   ID: ${s._id}`);
      console.log(`   isNoBid: ${s.isNoBid || false}`);
      console.log(`   Order: ${s.order}`);
      console.log('');
    });
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
