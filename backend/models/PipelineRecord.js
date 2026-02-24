const mongoose = require('mongoose');

const pipelineRecordSchema = new mongoose.Schema({
    stageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Stage',
        required: true
    },
    projectName: {
        type: String,
        required: true,
        trim: true
    },
    customerName: {
        type: String,
        required: true,
        trim: true
    },
    email: String,
    phone: String,
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    budget: Number,
    startDate: Date,
    dueDate: Date,
    address: String,
    description: {
        type: String,
        trim: true
    },
    notes: String
}, {
    timestamps: true
});

pipelineRecordSchema.index({ stageId: 1 });
pipelineRecordSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PipelineRecord', pipelineRecordSchema);
