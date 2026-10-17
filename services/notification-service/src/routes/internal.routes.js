// Service-to-service only (internal API key, not routed by Kong).
//
// POST /internal/messages takes one domain message and delivers it. It is
// the same code path the RabbitMQ consumer will call once CS-39's broker
// settings are agreed, and lets tests and the outbox relay drive delivery.
const express = require('express');
const { internalOnly } = require('../auth');
const { deliver } = require('../deliver');

const router = express.Router();

router.post('/messages', internalOnly, async (req, res, next) => {
  try {
    return res.json(await deliver(req.body));
  } catch (error) {
    if (error.status === 422) return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'A message needs id, type and payload' } });
    return next(error);
  }
});

module.exports = router;
