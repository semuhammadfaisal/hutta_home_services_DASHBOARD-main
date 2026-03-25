const express = require('express');
const router = express.Router();
const PipelineRecord = require('../models/PipelineRecord');

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

        if (req.body.customerName) record.customerName = req.body.customerName;
        if (req.body.email !== undefined) record.email = req.body.email;
        if (req.body.phone !== undefined) record.phone = req.body.phone;
        if (req.body.priority) record.priority = req.body.priority;
        if (req.body.budget !== undefined) record.budget = req.body.budget;
        if (req.body.startDate !== undefined) record.startDate = req.body.startDate;
        if (req.body.address !== undefined) record.address = req.body.address;
        if (req.body.description !== undefined) record.description = req.body.description;
        if (req.body.notes !== undefined) record.notes = req.body.notes;

        const updatedRecord = await record.save();
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
                    
                    // Auto-update payment status to 'received' when order moves to 'Paid'
                    if (newStageName === 'Paid') {
                        console.log('Order moved to Paid, Closed - checking for payment to update');
                        const Payment = require('../models/Payment');
                        const payment = await Payment.findOne({ order: record.orderId });
                        console.log('Found payment:', payment ? payment.paymentId : 'No payment found');
                        if (payment) {
                            console.log('Current payment status:', payment.status);
                            if (payment.status !== 'received' && payment.status !== 'completed') {
                                payment.status = 'received';
                                payment.paymentDate = new Date();
                                await payment.save();
                                console.log(`✅ Auto-updated payment ${payment.paymentId} to 'received' for order in 'Paid, Closed' stage`);
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
        } else {
            console.log('No order update needed:', {
                hasOrderId: !!record.orderId,
                hasNewStageName: !!newStageName,
                orderId: record.orderId,
                newStageName: newStageName
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
