const express = require('express');
const router = express.Router();
const PipelineRecord = require('../models/PipelineRecord');

// KPI: payments collected = sum of budgets for records in Paid/Close stages + received/completed payments not already counted
router.get('/kpi/payments-collected', async (req, res) => {
    try {
        const Stage = require('../models/Stage');
        const Payment = require('../models/Payment');

        // Find all stages whose name matches paid/close variants (case-insensitive)
        const allStages = await Stage.find().lean();
        const paidStageIds = allStages
            .filter(s => /^(paid|close|closed|complete|completed|won|done)$/i.test(s.name.trim()))
            .map(s => s._id);

        console.log('Paid stage IDs:', paidStageIds, 'from stages:', allStages.map(s => s.name));

        // Sum budgets of pipeline records in those stages
        const pipelineResult = await PipelineRecord.aggregate([
            { $match: { stageId: { $in: paidStageIds } } },
            { $group: { _id: null, total: { $sum: '$budget' }, orderIds: { $push: '$orderId' } } }
        ]);

        const pipelineTotal = pipelineResult[0]?.total || 0;
        const linkedOrderIds = (pipelineResult[0]?.orderIds || []).filter(Boolean);

        // Also count received/completed payments NOT linked to a pipeline-counted order
        const extraPayments = await Payment.find({
            status: { $in: ['received', 'completed'] },
            order: { $nin: linkedOrderIds }
        }).lean();
        const extraTotal = extraPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

        console.log('KPI result:', { pipelineTotal, extraTotal, total: pipelineTotal + extraTotal });
        res.json({ paymentsCollected: pipelineTotal + extraTotal });
    } catch (error) {
        console.error('KPI error:', error);
        res.status(500).json({ message: error.message });
    }
});

// Get all records
router.get('/', async (req, res) => {
    try {
        const records = await PipelineRecord.find().sort({ createdAt: -1 });
        res.json(records);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get records by stage
router.get('/stage/:stageId', async (req, res) => {
    try {
        const records = await PipelineRecord.find({ stageId: req.params.stageId });
        res.json(records);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Create new record
router.post('/', async (req, res) => {
    const record = new PipelineRecord({
        stageId: req.body.stageId,
        orderId: req.body.orderId,
        orderIdDisplay: req.body.orderIdDisplay,
        customerName: req.body.customerName,
        email: req.body.email,
        phone: req.body.phone,
        priority: req.body.priority || 'medium',
        budget: req.body.budget,
        startDate: req.body.startDate,
        address: req.body.address,
        description: req.body.description,
        notes: req.body.notes
    });

    try {
        const newRecord = await record.save();
        
        // Update order with pipelineRecordId and initial stage if orderId is provided
        if (req.body.orderId && req.body.stageId) {
            const Stage = require('../models/Stage');
            const stage = await Stage.findById(req.body.stageId);
            const stageName = stage ? stage.name : null;
            
            const Order = require('../models/Order');
            await Order.findByIdAndUpdate(req.body.orderId, { 
                pipelineRecordId: newRecord._id,
                pipelineStage: stageName
            });
            console.log(`Set order ${req.body.orderId} initial pipelineStage to: ${stageName}`);
        }
        
        res.status(201).json(newRecord);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update record
router.put('/:id', async (req, res) => {
    try {
        const record = await PipelineRecord.findById(req.params.id);
        if (!record) {
            return res.status(404).json({ message: 'Record not found' });
        }

        console.log('Updating pipeline record:', req.params.id);
        
        if (req.body.customerName) record.customerName = req.body.customerName;
        if (req.body.email !== undefined) record.email = req.body.email;
        if (req.body.phone !== undefined) record.phone = req.body.phone;
        if (req.body.priority) record.priority = req.body.priority;
        if (req.body.budget !== undefined) {
            record.budget = parseFloat(req.body.budget) || 0;
        }
        if (req.body.startDate !== undefined) record.startDate = req.body.startDate;
        if (req.body.address !== undefined) record.address = req.body.address;
        if (req.body.description !== undefined) record.description = req.body.description;
        if (req.body.notes !== undefined) record.notes = req.body.notes;
        if (req.body.orderId && !record.orderId) record.orderId = req.body.orderId;

        const updatedRecord = await record.save();
        
        // Sync budget changes to linked Order and Payment
        if (req.body.budget !== undefined) {
            try {
                const Order = require('../models/Order');
                const Payment = require('../models/Payment');
                const budgetAmount = parseFloat(req.body.budget) || 0;

                // Find order by orderId ref OR by pipelineRecordId backlink
                let order = record.orderId ? await Order.findById(record.orderId) : null;
                if (!order) {
                    order = await Order.findOne({ pipelineRecordId: record._id });
                }

                if (order) {
                    const prevAmount = order.amount;
                    order.amount = budgetAmount;
                    order.profit = budgetAmount - (order.vendorCost || 0) - (order.processingFee || 0);
                    await order.save();
                    console.log(`✅ Updated order amount: ${order.orderId} from ${prevAmount} to ${budgetAmount}`);

                    const payment = await Payment.findOne({ order: order._id });
                    if (payment) {
                        payment.amount = budgetAmount;
                        await payment.save();
                        console.log(`✅ Updated payment amount: ${payment.paymentId} to ${budgetAmount}`);
                    } else {
                        console.log('⚠️ No payment found for order:', order._id);
                    }
                } else {
                    console.log('⚠️ No linked order found for pipeline record:', record._id);
                }
            } catch (syncError) {
                console.error('❌ Error syncing budget to order/payment:', syncError.message);
            }
        }
        
        res.json(updatedRecord);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update record stage (for drag and drop)
router.patch('/:id/stage', async (req, res) => {
    try {
        console.log('=== PIPELINE STAGE UPDATE BACKEND ===');
        console.log('Record ID:', req.params.id);
        console.log('New Stage ID:', req.body.stageId);
        
        const record = await PipelineRecord.findById(req.params.id);
        if (!record) {
            return res.status(404).json({ message: 'Record not found' });
        }
        
        console.log('Found record:', {
            id: record._id,
            orderId: record.orderId,
            customerName: record.customerName,
            currentStageId: record.stageId
        });

        // Get the new stage name for updating the order
        const Stage = require('../models/Stage');
        const newStage = await Stage.findById(req.body.stageId);
        const newStageName = newStage ? newStage.name : null;
        
        console.log('New stage name:', newStageName);

        record.stageId = req.body.stageId;
        const updatedRecord = await record.save();
        
        // Update the linked order's pipelineStage field for immediate KPI updates
        if (record.orderId && newStageName) {
            console.log('Updating linked order:', record.orderId, 'to stage:', newStageName);
            const Order = require('../models/Order');
            
            try {
                const updateResult = await Order.findByIdAndUpdate(
                    record.orderId, 
                    { pipelineStage: newStageName }, 
                    { new: true, runValidators: true }
                );
                
                if (updateResult) {
                    console.log(`Successfully updated order ${record.orderId} pipelineStage to: ${newStageName}`);
                    console.log('Updated order pipelineStage field:', updateResult.pipelineStage);
                    
                    // Auto-update payment status to 'received' when order moves to Paid/Close stage
                    if (/^(paid|close|closed|complete|completed|won|done)$/i.test(newStageName.trim())) {
                        console.log('Order moved to paid/close stage - checking for payment to update');
                        const Payment = require('../models/Payment');
                        const payment = await Payment.findOne({ order: record.orderId });
                        console.log('Found payment:', payment ? payment.paymentId : 'No payment found');
                        if (payment) {
                            console.log('Current payment status:', payment.status);
                            if (payment.status !== 'received' && payment.status !== 'completed') {
                                payment.status = 'received';
                                payment.paymentDate = new Date();
                                await payment.save();
                                console.log(`✅ Auto-updated payment ${payment.paymentId} to 'received'`);
                            } else {
                                console.log('Payment already marked as received/completed');
                            }
                        } else {
                            console.log('⚠️ No payment found for order:', record.orderId);
                        }
                    }
                    
                    // Force a small delay to ensure database write is committed
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Verify the update was persisted
                    const verifyOrder = await Order.findById(record.orderId);
                    if (verifyOrder && verifyOrder.pipelineStage === newStageName) {
                        console.log('✅ Order update verified in database');
                    } else {
                        console.log('❌ Order update not yet persisted, current stage:', verifyOrder?.pipelineStage);
                    }
                } else {
                    console.log(`Order ${record.orderId} not found or not updated`);
                }
            } catch (orderUpdateError) {
                console.error('Error updating order pipelineStage:', orderUpdateError);
            }
        } else if (!record.orderId && newStageName && /^(paid|close|closed|complete|completed|won|done)$/i.test(newStageName.trim())) {
            // No linked order — try to find payment by budget amount match for manually-created records
            console.log('No orderId on record, attempting payment lookup by budget for manual record');
            try {
                const Payment = require('../models/Payment');
                const payments = await Payment.find({
                    amount: record.budget,
                    status: { $nin: ['received', 'completed'] }
                }).lean();
                if (payments.length === 1) {
                    await Payment.findByIdAndUpdate(payments[0]._id, {
                        status: 'received',
                        paymentDate: new Date()
                    });
                    console.log(`✅ Auto-updated unlinked payment ${payments[0].paymentId || payments[0]._id} to 'received'`);
                } else {
                    console.log(`⚠️ Found ${payments.length} matching payments by budget — skipping ambiguous update`);
                }
            } catch (e) {
                console.warn('Could not auto-update unlinked payment:', e.message);
            }
        } else {
            console.log('No order update needed:', {
                hasOrderId: !!record.orderId,
                hasNewStageName: !!newStageName
            });
        }
        
        console.log('=== PIPELINE STAGE UPDATE COMPLETE ===');
        res.json(updatedRecord);
    } catch (error) {
        console.error('Pipeline stage update error:', error);
        res.status(400).json({ message: error.message });
    }
});

// Delete record
router.delete('/:id', async (req, res) => {
    try {
        const record = await PipelineRecord.findById(req.params.id);
        if (!record) {
            return res.status(404).json({ message: 'Record not found' });
        }

        await record.deleteOne();
        res.json({ message: 'Record deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
