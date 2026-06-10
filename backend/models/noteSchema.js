const mongoose = require('mongoose');

const noteEditSchema = new mongoose.Schema({
  editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  editedByName: { type: String, default: 'Unknown User' },
  editedAt: { type: Date, default: Date.now }
}, { _id: false });

const noteSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdByEmail: String,
  createdByName: { type: String, default: 'Unknown User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date,
  edits: { type: [noteEditSchema], default: [] }
}, { _id: true });

module.exports = noteSchema;
