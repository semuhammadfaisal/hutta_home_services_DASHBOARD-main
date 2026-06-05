const mongoose = require('mongoose');
const Stage = require('./models/Stage');
const PipelineRecord = require('./models/PipelineRecord');
const Order = require('./models/Order');

mongoose.connect('mongodb://localhost:27017/hutta_home_services')
  .then(async () => {
    console.log(' Connected to MongoDB\n');
    
    // Find NO BID stages
    const noBidStages = await Stage.find({ isNoBid: true }).lean();
    console.log('NO BID Stages:', noBidStages.map(s => s.name).join(', '));
    console.log('NO BID Stage IDs:', noBidStages.map(s => s._id).join(', '));
    
    // Find pipeline records in NO BID stages
    const noBidStageIds = noBidStages.map(s => s._id);
    const noBidRecords = await PipelineRecord.find({ 
      stageId: { $in: noBidStageIds } 
    }).lean();
    
    console.log(`\nPipeline records in NO BID stages: ${noBidRecords.length}`);
    
    // Find orders linked to NO BID records
    const noBidOrderIds = noBidRecords.map(r => r.orderId).filter(Boolean);
    console.log(`Orders in NO BID stages: ${noBidOrderIds.length}`);
    
    if (noBidOrderIds.length > 0) {
      const noBidOrders = await Order.find({ _id: { $in: noBidOrderIds } }).lean();
      console.log('\nNO BID Orders:');
      noBidOrders.forEach(o => {
        console.log(`  - ${o.orderId}: $${o.amount} (${o.service})`);
      });
      
      const totalNoBidAmount = noBidOrders.reduce((sum, o) => sum + (o.amount || 0), 0);
      console.log(`\nTotal NO BID Amount: $${totalNoBidAmount.toFixed(2)}`);
    }
    
    // Show all orders
    const allOrders = await Order.find().lean();
    const totalAllAmount = allOrders.reduce((sum, o) => sum + (o.amount || 0), 0);
    console.log(`\nTotal All Orders: ${allOrders.length}`);
    console.log(`Total All Amount: $${totalAllAmount.toFixed(2)}`);
    
    // Calculate what should be shown
    const visibleOrders = allOrders.filter(o => 
      !noBidOrderIds.some(nid => nid.toString() === o._id.toString())
    );
    const totalVisibleAmount = visibleOrders.reduce((sum, o) => sum + (o.amount || 0), 0);
    console.log(`\nVisible Orders (excluding NO BID): ${visibleOrders.length}`);
    console.log(`Visible Amount (excluding NO BID): $${totalVisibleAmount.toFixed(2)}`);
    
    console.log('\n Stats cache will be cleared on next server restart');
    console.log('Or wait 60 seconds for cache to expire');
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
