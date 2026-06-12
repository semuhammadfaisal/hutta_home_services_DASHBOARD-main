const express = require('express');
const mongoose = require('mongoose');
const authenticateToken = require('../middleware/auth');
const { buildNote, getUserId, syncLegacyNotes } = require('../utils/notes');

const router = express.Router();

const modelMap = {
  orders: require('../models/Order'),
  customers: require('../models/Customer'),
  vendors: require('../models/Vendor'),
  payments: require('../models/Payment'),
  'pipeline-records': require('../models/PipelineRecord'),
  projects: require('../models/Project')
};

function getModel(entity) {
  return modelMap[entity];
}

async function findEntity(req, res) {
  const Model = getModel(req.params.entity);
  if (!Model || !mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(404).json({ message: 'Notes target not found' });
    return null;
  }

  const doc = await Model.findById(req.params.id);
  if (!doc) {
    res.status(404).json({ message: 'Notes target not found' });
    return null;
  }

  if (!Array.isArray(doc.notesHistory)) {
    doc.notesHistory = [];
  }

  return doc;
}

function userOwnsNote(note, req) {
  const userId = getUserId(req);
  if (userId && note.createdBy && String(note.createdBy) === String(userId)) return true;
  return Boolean(req.user?.email && note.createdByEmail && String(note.createdByEmail) === String(req.user.email));
}

router.post('/:entity/:id', authenticateToken, async (req, res) => {
  try {
    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ message: 'Note text is required' });

    const doc = await findEntity(req, res);
    if (!doc) return;

    doc.notesHistory.push(buildNote(text, req));
    syncLegacyNotes(doc);
    await doc.save();

    res.status(201).json({ notesHistory: doc.notesHistory, notes: doc.notes });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

router.put('/:entity/:id/:noteId', authenticateToken, async (req, res) => {
  try {
    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ message: 'Note text is required' });

    const doc = await findEntity(req, res);
    if (!doc) return;

    const note = doc.notesHistory.id(req.params.noteId);
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (!userOwnsNote(note, req)) {
      return res.status(403).json({ message: 'You can only edit your own notes' });
    }

    note.text = text;
    note.updatedAt = new Date();
    note.edits.push({
      editedBy: getUserId(req),
      editedByName: [req.user?.firstName, req.user?.lastName].filter(Boolean).join(' ').trim() || req.user?.email || 'Unknown User',
      editedAt: note.updatedAt
    });

    syncLegacyNotes(doc);
    await doc.save();

    res.json({ notesHistory: doc.notesHistory, notes: doc.notes });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

router.delete('/:entity/:id/:noteId', authenticateToken, async (req, res) => {
  try {
    const doc = await findEntity(req, res);
    if (!doc) return;

    const note = doc.notesHistory.id(req.params.noteId);
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (!userOwnsNote(note, req)) {
      return res.status(403).json({ message: 'You can only delete your own notes' });
    }

    note.deleteOne();
    syncLegacyNotes(doc);
    await doc.save();

    res.json({ notesHistory: doc.notesHistory, notes: doc.notes });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

module.exports = router;
