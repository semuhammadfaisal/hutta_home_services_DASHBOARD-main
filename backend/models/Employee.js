const mongoose = require('mongoose');
const attachmentSchema = require('./attachmentSchema');
const { applyNormalizedSearch } = require('../utils/searchNormalization');

const employeeSchema = new mongoose.Schema({
  normalizedName: { type: String, default: '' },
  normalizedEmail: { type: String, default: '' },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: String,
  address: String,
  role: { 
    type: String, 
    enum: ['electrician', 'plumber', 'carpenter', 'hvac-technician', 'project-manager', 'supervisor', 'general-worker'], 
    required: true 
  },
  department: String,
  salary: Number,
  hireDate: { type: Date, default: Date.now },
  status: { 
    type: String, 
    enum: ['available', 'busy', 'offline', 'on-leave'], 
    default: 'available' 
  },
  skills: [String],
  avatar: String,
  isActive: { type: Boolean, default: true },
  documents: { type: [attachmentSchema], default: [] }
}, { timestamps: true });

employeeSchema.index({ normalizedName: 1 });
employeeSchema.index({ normalizedEmail: 1 });
employeeSchema.index({ isActive: 1, status: 1, normalizedName: 1 });
applyNormalizedSearch(employeeSchema, { normalizedName: 'name', normalizedEmail: 'email' });

module.exports = mongoose.model('Employee', employeeSchema);
