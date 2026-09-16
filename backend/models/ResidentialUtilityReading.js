const mongoose = require('mongoose');

const residentialUtilityReadingSchema = new mongoose.Schema({
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  utilityType: { type: String, enum: ['electricity', 'water', 'gas'], required: true },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  usage: { type: Number, required: true, min: 0, max: 100000000 },
  unit: { type: String, enum: ['kWh', 'gallons', 'therms'], required: true },
  cost: { type: Number, min: 0, max: 1000000 },
  notes: { type: String, trim: true, maxlength: 500 }
}, { timestamps: true });

residentialUtilityReadingSchema.index({ propertyId: 1, utilityType: 1, periodEnd: -1 });
module.exports = mongoose.model('ResidentialUtilityReading', residentialUtilityReadingSchema);
