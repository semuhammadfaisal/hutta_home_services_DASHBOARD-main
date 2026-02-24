const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
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
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Employee', employeeSchema);