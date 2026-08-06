const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 254 },
  password: { type: String, required: true, minlength: 8 },
  firstName: { type: String, required: true, trim: true, maxlength: 80 },
  lastName: { type: String, required: true, trim: true, maxlength: 80 },
  role: { type: String, enum: ['admin', 'manager', 'account_rep', 'pending'], default: 'pending' },
  requestedRole: { type: String, enum: ['admin', 'manager', 'account_rep'] },
  phone: { type: String, trim: true, maxlength: 40 },
  department: { type: String, trim: true, maxlength: 100 },
  avatar: String,
  isActive: { type: Boolean, default: true },
  resetPasswordToken: String,
  resetPasswordExpiry: Date
}, { timestamps: true });

userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', userSchema);
