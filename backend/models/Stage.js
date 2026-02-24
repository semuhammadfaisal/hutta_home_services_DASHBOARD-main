const mongoose = require('mongoose');

const stageSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    position: {
        type: Number,
        required: true
    },
    description: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

// Index for faster queries
stageSchema.index({ position: 1 });

module.exports = mongoose.model('Stage', stageSchema);
