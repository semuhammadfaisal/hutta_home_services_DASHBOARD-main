(function (root) {
  class CommercialRequestDraft {
    constructor(random = () => root.crypto.randomUUID()) { this.random = random; this.busy = false; this.key = null; }
    start(payload) {
      if (this.busy) return null;
      const fingerprint = JSON.stringify(payload);
      if (!this.key || fingerprint !== this.fingerprint) { this.key = `commercial-${this.random()}`; this.fingerprint = fingerprint; }
      this.busy = true; return this.key;
    }
    finish(success) { this.busy = false; if (success) { this.key = null; this.fingerprint = null; } }
  }
  root.CommercialRequestDraft = CommercialRequestDraft;
  if (typeof module !== 'undefined') module.exports = CommercialRequestDraft;
})(typeof window !== 'undefined' ? window : globalThis);
