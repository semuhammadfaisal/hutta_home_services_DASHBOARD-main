const { normalizeLineItems } = require('./vendorEstimateDrafts');

function normalizeParserOutput(payload = {}) {
  const parsed = payload.data || payload.result || payload;
  const { lineItems, errors } = normalizeLineItems(parsed.lineItems, { requireItems: true });
  if (errors.length) throw Object.assign(new Error('Parser returned malformed estimate data'), { code: 'malformed_parser_output' });
  return { scope: String(parsed.scope || '').trim().slice(0, 10000), notes: String(parsed.notes || '').trim().slice(0, 10000), lineItems };
}

function unavailableProvider() {
  return { name: 'none', model: '', configured: false, async parse() { return { status: 'unavailable', provider: 'none', model: '', output: { scope: '', notes: '', lineItems: [] } }; } };
}

function httpJsonProvider() {
  const endpoint = String(process.env.VENDOR_ESTIMATE_PARSER_URL || '').trim();
  const apiKey = String(process.env.VENDOR_ESTIMATE_PARSER_API_KEY || '').trim();
  const model = String(process.env.VENDOR_ESTIMATE_PARSER_MODEL || '').trim();
  if (!endpoint || !apiKey) return unavailableProvider();
  return {
    name: 'http_json', model, configured: true,
    async parse(file) {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(endpoint, { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ task: 'vendor_estimate_line_items', model: model || undefined, file: { name: file.originalname, mimeType: file.mimetype, base64: file.buffer.toString('base64') }, outputSchema: { scope: 'string', notes: 'string', lineItems: [{ category: 'labor|material|other', description: 'string', quantity: 'number', unit: 'string', unitPrice: 'number' }] } }) });
        if (!response.ok) throw Object.assign(new Error('Parser provider rejected the document'), { code: `provider_http_${response.status}` });
        const payload = await response.json();
        return { status: 'succeeded', provider: 'http_json', model: payload.model || model, requestId: payload.requestId || response.headers.get('x-request-id') || '', output: normalizeParserOutput(payload) };
      } finally { clearTimeout(timer); }
    }
  };
}

function getVendorEstimateParser() {
  return String(process.env.VENDOR_ESTIMATE_PARSER_PROVIDER || '').toLowerCase() === 'http_json' ? httpJsonProvider() : unavailableProvider();
}

async function parseVendorEstimate(file, provider = getVendorEstimateParser()) {
  if (!provider.configured) return provider.parse(file);
  try { return await provider.parse(file); }
  catch (error) { return { status: 'failed', provider: provider.name, model: provider.model || '', errorCode: String(error.code || error.name || 'parser_failure').slice(0, 120), output: { scope: '', notes: '', lineItems: [] } }; }
}

module.exports = { getVendorEstimateParser, normalizeParserOutput, parseVendorEstimate };
