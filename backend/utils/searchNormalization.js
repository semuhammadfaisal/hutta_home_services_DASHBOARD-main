const { normalizeSearch } = require('./cursorPagination');

function applyNormalizedSearch(schema, mappings) {
  schema.pre('validate', function normalizedSearchDocument(next) {
    for (const [target, source] of Object.entries(mappings)) this.set(target, normalizeSearch(this.get(source)));
    next();
  });
  schema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function normalizedSearchUpdate(next) {
    const update = this.getUpdate() || {};
    const source = update.$set || update;
    const target = update.$set || update;
    for (const [normalizedField, sourceField] of Object.entries(mappings)) {
      let value;
      if (Object.prototype.hasOwnProperty.call(source, sourceField)) value = source[sourceField];
      else {
        const parts = sourceField.split('.'); let current = source;
        for (const part of parts) { current = current && typeof current === 'object' ? current[part] : undefined; }
        value = current;
      }
      if (value !== undefined) target[normalizedField] = normalizeSearch(value);
    }
    this.setUpdate(update);
    next();
  });
}

module.exports = { applyNormalizedSearch };
