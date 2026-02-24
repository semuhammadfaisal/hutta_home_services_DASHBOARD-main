const express = require('express');
const router = express.Router();
const Stage = require('../models/Stage');

// Get all stages
router.get('/', async (req, res) => {
    try {
        const stages = await Stage.find().sort({ position: 1 });
        res.json(stages);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Create new stage
router.post('/', async (req, res) => {
    const stage = new Stage({
        name: req.body.name,
        position: req.body.position,
        description: req.body.description
    });

    try {
        const newStage = await stage.save();
        res.status(201).json(newStage);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update stage
router.put('/:id', async (req, res) => {
    try {
        const stage = await Stage.findById(req.params.id);
        if (!stage) {
            return res.status(404).json({ message: 'Stage not found' });
        }

        if (req.body.name) stage.name = req.body.name;
        if (req.body.position) stage.position = req.body.position;
        if (req.body.description !== undefined) stage.description = req.body.description;

        const updatedStage = await stage.save();
        res.json(updatedStage);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Delete stage
router.delete('/:id', async (req, res) => {
    try {
        const stage = await Stage.findById(req.params.id);
        if (!stage) {
            return res.status(404).json({ message: 'Stage not found' });
        }

        await stage.deleteOne();
        res.json({ message: 'Stage deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Reorder stages
router.patch('/reorder', async (req, res) => {
    try {
        const stages = req.body;
        
        for (const stageData of stages) {
            await Stage.findByIdAndUpdate(stageData._id || stageData.id, {
                position: stageData.position
            });
        }

        const updatedStages = await Stage.find().sort({ position: 1 });
        res.json(updatedStages);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

module.exports = router;
