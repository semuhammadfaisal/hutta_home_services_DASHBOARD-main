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
        projectName: req.body.projectName,
        customerName: req.body.customerName,
        email: req.body.email,
        phone: req.body.phone,
        priority: req.body.priority || 'medium',
        budget: req.body.budget,
        startDate: req.body.startDate,
        dueDate: req.body.dueDate,
        address: req.body.address,
        description: req.body.description,
        notes: req.body.notes
    });

    try {
        const newRecord = await record.save();
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

        if (req.body.projectName) record.projectName = req.body.projectName;
        if (req.body.customerName) record.customerName = req.body.customerName;
        if (req.body.email !== undefined) record.email = req.body.email;
        if (req.body.phone !== undefined) record.phone = req.body.phone;
        if (req.body.priority) record.priority = req.body.priority;
        if (req.body.budget !== undefined) record.budget = req.body.budget;
        if (req.body.startDate !== undefined) record.startDate = req.body.startDate;
        if (req.body.dueDate !== undefined) record.dueDate = req.body.dueDate;
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
        const record = await PipelineRecord.findById(req.params.id);
        if (!record) {
            return res.status(404).json({ message: 'Record not found' });
        }

        record.stageId = req.body.stageId;
        const updatedRecord = await record.save();
        res.json(updatedRecord);
    } catch (error) {
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
