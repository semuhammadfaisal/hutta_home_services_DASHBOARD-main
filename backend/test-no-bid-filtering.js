const mongoose = require('mongoose');
const Stage = require('./models/Stage');
const PipelineRecord = require('./models/PipelineRecord');
const Order = require('./models/Order');

async function testNoBidFiltering() {
  try {
    require('dotenv').config();
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Step 1: Find NO BID stages
    const noBidStages = await Stage.find({ isNoBid: true }).select('_id name').lean();
    console.log('Step 1: NO BID Stages');
    console.log('  Count:', noBidStages.length);
    noBidStages.forEach(s => console.log(`  - ${s.name} (${s._id})`));
    
    if (noBidStages.length === 0) {
      console.log('\n❌ NO NO BID STAGES FOUND!');
      console.log('Run: node mark-stage-as-no-bid.js "Lost"');
      process.exit(1);
    }
    
    const noBidStageObjectIds = noBidStages.map(s => s._id);
    
    // Step 2: Find pipeline records in NO BID stages
    const noBidRecords = await PipelineRecord.find({
      stageId: { $in: noBidStageObjectIds }
    }).select('orderId stageId').lean();
    
    console.log('\nStep 2: Pipeline Records in NO BID stages');
    console.log('  Count:', noBidRecords.length);
    
    const noBidOrderIds = noBidRecords.map(r => r.orderId).filter(Boolean);
    console.log('  Order IDs:', noBidOrderIds.length);
    
    if (noBidOrderIds.length === 0) {
      console.log('\n⚠️  No orders in NO BID stages');
      console.log('This is normal if you haven\'t moved any orders to Lost stage yet');
      process.exit(0);
    }
    
    // Step 3: Get the actual orders
    const noBidOrders = await Order.find({ _id: { $in: noBidOrderIds } })
      .select('orderId amount service')
      .lean();
    
    console.log('\nStep 3: Orders that SHOULD BE EXCLUDED');
    noBidOrders.forEach(o => {
      console.log(`  - ${o.orderId}: $${o.amount.toLocaleString()} (${o.service})`);
    });
    
    const totalNoBidAmount = noBidOrders.reduce((sum, o) => sum + (o.amount || 0), 0);
    console.log(`  Total: $${totalNoBidAmount.toLocaleString()}`);
    
    // Step 4: Calculate what SHOULD be shown
    const allOrders = await Order.find().select('orderId amount').lean();
    const visibleOrders = allOrders.filter(o => 
      !noBidOrderIds.some(nid => nid.toString() === o._id.toString())
    );
    
    const totalAllAmount = allOrders.reduce((sum, o) => sum + (o.amount || 0), 0);
    const totalVisibleAmount = visibleOrders.reduce((sum, o) => sum + (o.amount || 0), 0);
    
    console.log('\nStep 4: EXPECTED DASHBOARD VALUES');
    console.log(`  Total Orders: ${visibleOrders.length} (excluding ${noBidOrders.length} NO BID)`);
    console.log(`  Total Revenue: $${totalVisibleAmount.toLocaleString()}`);
    console.log(`  Hidden Revenue: $${totalNoBidAmount.toLocaleString()}`);
    
    console.log('\n✅ Test complete');
    console.log('\nIf dashboard shows different values:');
    console.log('  1. Restart your backend server');
    console.log('  2. Hard refresh browser (Ctrl+F5)');
    console.log('  3. Check server console for "🚫 Excluding X NO BID orders"');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testNoBidFiltering();
