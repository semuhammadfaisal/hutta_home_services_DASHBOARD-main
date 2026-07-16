function getUserId(req) {
  const id = req.user?.userId || req.user?.id;
  return id || undefined;
}

function getUserName(req) {
  const fullName = [req.user?.firstName, req.user?.lastName].filter(Boolean).join(' ').trim();
  return fullName || req.user?.email || 'Unknown User';
}

function buildNote(text, req) {
  return {
    text: String(text || '').trim(),
    createdBy: getUserId(req),
    createdByEmail: req.user?.email,
    createdByName: getUserName(req),
    createdAt: new Date(),
    edits: []
  };
}

function syncLegacyNotes(doc) {
  const notes = Array.isArray(doc.notesHistory) ? doc.notesHistory : [];
  doc.notes = notes
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .map(note => note.text)
    .filter(Boolean)
    .join('\n\n');
}

function seedInitialNote(target, text, req) {
  const noteText = String(text || '').trim();
  if (!noteText) return;
  target.notesHistory = [buildNote(noteText, req)];
  target.notes = noteText;
}

function stripNotesFromUpdate(body) {
  const update = { ...body };
  delete update.notes;
  delete update.notesHistory;
  delete update.newNote;
  delete update.noteText;
  return update;
}

module.exports = {
  buildNote,
  getUserId,
  getUserName,
  seedInitialNote,
  stripNotesFromUpdate,
  syncLegacyNotes
};
