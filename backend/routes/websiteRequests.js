const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  MAX_BODY_BYTES,
  processWebsiteRequest,
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

router._test = { validatePayload, verifyWebhookSignature };
module.exports = router;
