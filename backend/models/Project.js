const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  projectId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: String,
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  assignedEmployees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }],
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
  status: { 
    type: String, 
    enum: ['planning', 'in-progress', 'on-hold', 'completed', 'cancelled'], 
    default: 'planning' 
  },
  priority: { 
    type: String, 
    enum: ['low', 'medium', 'high', 'urgent'], 
    default: 'medium' 
  },
  budget: { type: Number, required: true },
  actualCost: { type: Number, default: 0 },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  actualStartDate: Date,
  actualEndDate: Date,
  progress: { type: Number, min: 0, max: 100, default: 0 },
  location: String,
  notes: String,
  attachments: [String]
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);