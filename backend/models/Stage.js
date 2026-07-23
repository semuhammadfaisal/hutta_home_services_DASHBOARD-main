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
    },
    systemKey: {
        type: String,
        trim: true
    },
    isNoBid: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Index for faster queries
stageSchema.index({ position: 1 });
stageSchema.index({ systemKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Stage', stageSchema);
