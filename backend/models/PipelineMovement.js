const mongoose = require('mongoose');

const pipelineMovementSchema = new mongoose.Schema({
    recordId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PipelineRecord',
        required: true
    },
    projectName: {
        type: String,
        required: true
    },
    fromStageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Stage'
    },
    fromStageName: {
        type: String
    },
    toStageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Stage',
        required: true
    },
    toStageName: {
        type: String,
        required: true
    },
    movedBy: {
        type: String,
        default: 'Admin'
    },
    movedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

pipelineMovementSchema.index({ recordId: 1 });
pipelineMovementSchema.index({ movedAt: -1 });

module.exports = mongoose.model('PipelineMovement', pipelineMovementSchema);
