const express = require('express');
const router = express.Router();
const Stage = require('../models/Stage');
const memCache = require('../utils/memoryCache');

const STAGES_CACHE_KEY = 'stages:list:v1';
const STAGES_TTL_MS = parseInt(process.env.STAGES_CACHE_MS || '30000', 10);

function invalidateStagesCache() {
    memCache.del(STAGES_CACHE_KEY);
}

// Get all stages
router.get('/', async (req, res) => {
    try {
        const cached = memCache.get(STAGES_CACHE_KEY);
        if (cached) {
            return res.json(cached);
        }
        const stages = await Stage.find().sort({ position: 1 }).lean();
        memCache.set(STAGES_CACHE_KEY, stages, STAGES_TTL_MS);
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
        description: req.body.description,
        isNoBid: req.body.isNoBid || false
    });

    try {
        const newStage = await stage.save();
        invalidateStagesCache();
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
        if (req.body.isNoBid !== undefined) stage.isNoBid = req.body.isNoBid;

        const updatedStage = await stage.save();
        invalidateStagesCache();
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
        invalidateStagesCache();
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

        invalidateStagesCache();
        const updatedStages = await Stage.find().sort({ position: 1 }).lean();
        res.json(updatedStages);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

module.exports = router;
