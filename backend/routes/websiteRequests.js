const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  MAX_BODY_BYTES,
  isForminatorConnectionProbe,
  mapForminatorPayload,
  processWebsiteRequest,
  safeSecretEqual,
  validatePayload,
  verifyWebhookSignature
} = require('../utils/websiteIntake');

const router = express.Router();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.INTAKE_RATE_LIMIT_MAX || '120', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' }
});

router.post('/website-requests', limiter, async (req, res) => {
  try {
    const rawBody = req.rawBody;
    if (!rawBody || rawBody.length > MAX_BODY_BYTES) {
      return res.status(400).json({ message: 'Invalid request body' });
    }
    const validSignature = verifyWebhookSignature({
      rawBody,
      timestamp: req.get('X-Huttas-Timestamp'),
      signature: req.get('X-Huttas-Signature'),
      secret: process.env.HUTTAS_WEBHOOK_SECRET
    });
    if (!validSignature) return res.status(401).json({ message: 'Invalid or expired webhook signature' });

    const { payload, errors } = validatePayload(req.body);
    if (errors.length) return res.status(400).json({ message: 'Invalid website request', errors });

    const result = await processWebsiteRequest(payload);
    return res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) {
    console.error('Website intake failed:', error?.code || error?.name || 'unknown');
    return res.status(500).json({ message: 'Unable to receive request' });
  }
});

router.post(['/website-requests/forminator', '/website-requests/contact-form-7'], limiter, async (req, res) => {
  try {
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    if (!rawBody.length || rawBody.length > MAX_BODY_BYTES) {
      return res.status(400).json({ message: 'Invalid request body' });
    }
    const isContactForm7 = req.path.endsWith('/contact-form-7');
    const webhookKey = isContactForm7
      ? (process.env.CONTACT_FORM_7_WEBHOOK_KEY || process.env.FORMINATOR_WEBHOOK_KEY)
      : process.env.FORMINATOR_WEBHOOK_KEY;
    if (!safeSecretEqual(req.query.key, webhookKey)) {
      return res.status(401).json({ message: 'Invalid website form webhook key' });
    }

    const expectedFormId = isContactForm7
      ? String(process.env.CONTACT_FORM_7_FORM_ID || '')
      : String(process.env.FORMINATOR_FORM_ID || '1029');
    const receivedFormId = String(req.body?.form_id || req.body?.formId || req.body?._wpcf7 || '');
    if (expectedFormId && receivedFormId && receivedFormId !== expectedFormId) {
      return res.status(400).json({ message: 'Unexpected website form' });
    }

    const mapped = mapForminatorPayload(req.body, rawBody);
    if (isForminatorConnectionProbe(req.get('X-Hook-Test'))) {
      return res.status(200).json({ success: true, status: 'ready' });
    }
    const { payload, errors } = validatePayload(mapped);
    if (errors.length) return res.status(400).json({ message: 'Invalid website form request', errors });

    const result = await processWebsiteRequest(payload);
    return res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) {
    console.error('Website form intake failed:', error?.code || error?.name || 'unknown');
    return res.status(500).json({ message: 'Unable to receive website form request' });
  }
});

router._test = { validatePayload, verifyWebhookSignature };
module.exports = router;
