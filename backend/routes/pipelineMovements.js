const express = require('express');
const router = express.Router();
const PipelineMovement = require('../models/PipelineMovement');

// Get all movements
router.get('/', async (req, res) => {
    try {
        const movements = await PipelineMovement.find()
            .sort({ movedAt: -1 })
            .limit(100);
        res.json(movements);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get movements for a specific record
router.get('/record/:recordId', async (req, res) => {
    try {
        const movements = await PipelineMovement.find({ recordId: req.params.recordId })
            .sort({ movedAt: -1 });
        res.json(movements);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Log new movement
router.post('/', async (req, res) => {
    const movement = new PipelineMovement({
        recordId: req.body.recordId,
        projectName: req.body.projectName,
        fromStageId: req.body.fromStageId,
        fromStageName: req.body.fromStageName,
        toStageId: req.body.toStageId,
        toStageName: req.body.toStageName,
        movedBy: req.body.movedBy || 'Admin'
    });

    try {
        const newMovement = await movement.save();
        res.status(201).json(newMovement);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

module.exports = router;
