const express = require('express');
const { requireAuth, requireRole } = require('../auth');
const { validateRequirements, decideRequirements, canReadRequirements, canEditRequirements } = require('../domain/technical-request');
const store = require('../store');
const config = require('../config');

const router = express.Router();
router.use(requireAuth());

function sendError(res, status, code, message, fields) {
  return res.status(status).json({ error: { code, message, ...(fields ? { fields } : {}) } });
}

function requestInput(body) {
  return {
    eventId: body.eventRequestId,
    coordinatorId: body.coordinatorId,
    equipment: body.equipment,
    supportRequired: body.supportRequired,
    supportDetails: body.supportDetails,
    placementDetails: body.placementDetails,
    notRequired: body.notRequired,
  };
}

async function isCurrentCoordinator(req, eventRequestId) {
  if (config.isTest || process.env.AUTH_MODE === 'mock') {
    const claimed = req.get('x-test-current-coordinator-id');
    return !claimed || claimed === req.actor.id;
  }
  const token = (req.get('authorization') || '').slice(7);
  const response = await fetch(`${config.eventServiceUrl}/event-requests/${encodeURIComponent(eventRequestId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return false;
  const request = await response.json();
  return request.currentCoordinatorId === req.actor.id;
}

router.get('/equipment-types', requireRole('EVENT_COORDINATOR', 'TECHNICAL_SUPPORT_STAFF'), async (_req, res, next) => {
  try { return res.json({ equipmentTypes: await store.listEquipmentTypes() }); }
  catch (error) { return next(error); }
});

router.get('/technical-requests', requireRole('TECHNICAL_SUPPORT_STAFF'), async (_req, res, next) => {
  try {
    const requests = (await store.listRequests()).filter(request => request.status === 'SUBMITTED').map(store.requestView);
    return res.json({ requests });
  }
  catch (error) { return next(error); }
});

router.get('/event-requests/:eventRequestId/technical-request', async (req, res, next) => {
  try {
    const request = await store.findRequest(req.params.eventRequestId);
    if (!request) return sendError(res, 404, 'NOT_FOUND', 'Technical request not found.');
    if (!canReadRequirements(req.actor, { eventId: request.eventRequestId, coordinatorId: request.coordinatorId })) return sendError(res, 403, 'FORBIDDEN', 'You do not have permission to view this technical request.');
    return res.json(store.requestView(request));
  }
  catch (error) { return next(error); }
});

router.post('/event-requests/:eventRequestId/technical-request', requireRole('EVENT_COORDINATOR'), async (req, res, next) => {
  try {
    const eventRequestId = req.params.eventRequestId;
    if (!(await isCurrentCoordinator(req, eventRequestId))) return sendError(res, 403, 'FORBIDDEN', 'Only the currently assigned Coordinator may submit technical requirements.');
    const key = req.get('Idempotency-Key');
    const hash = store.requestHash({ eventRequestId, body: req.body || {} });
    const replay = await store.findIdempotency(req.actor.id, key);
    if (replay) {
      if (replay.requestHash !== hash) return sendError(res, 422, 'IDEMPOTENCY_KEY_REUSED', 'This action key was already used for a different request.');
      res.set('Idempotency-Replayed', 'true');
      return res.json(replay.responseBody);
    }
    const previous = await store.findRequest(eventRequestId);
    if (previous && (!canEditRequirements(req.actor, previous) || Number(req.body?.version) !== previous.version)) return sendError(res, 409, 'STALE_VERSION', 'The request changed or was reassigned. Reload and try again.');
    if (!previous && Number(req.body?.version) !== 1) return sendError(res, 409, 'STALE_VERSION', 'A new technical request must start at version 1.');
    const types = (await store.listEquipmentTypes()).map(item => item.name);
    const validation = validateRequirements(requestInput({ ...req.body, eventRequestId, coordinatorId: req.actor.id }), types, previous);
    if (!validation.valid) return sendError(res, 422, 'VALIDATION_FAILED', 'Please fix the highlighted technical requirements.', validation.errors);
    const saved = await store.saveSubmission({ eventRequestId, actor: req.actor, value: validation.value, key, hash });
    if (saved.conflict) return sendError(res, 409, 'STALE_VERSION', 'The request changed while you were submitting. Reload and try again.');
    return res.status(previous ? 200 : 201).json(saved.result);
  }
  catch (error) { return next(error); }
});

router.post('/event-requests/:eventRequestId/technical-request/decision', requireRole('TECHNICAL_SUPPORT_STAFF'), async (req, res, next) => {
  try {
    const eventRequestId = req.params.eventRequestId;
    const key = req.get('Idempotency-Key');
    const hash = store.requestHash({ eventRequestId, body: req.body || {} });
    const replay = await store.findIdempotency(req.actor.id, key);
    if (replay) {
      if (replay.requestHash !== hash) return sendError(res, 422, 'IDEMPOTENCY_KEY_REUSED', 'This action key was already used for a different decision.');
      res.set('Idempotency-Replayed', 'true');
      return res.json(replay.responseBody);
    }
    const request = await store.findRequest(eventRequestId);
    if (!request) return sendError(res, 404, 'NOT_FOUND', 'Technical request not found.');
    const decision = req.body?.decision;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
    try { decideRequirements(request, req.actor, decision, reason, Number(req.body?.version)); }
    catch (error) { return sendError(res, error.status || 422, error.status === 409 ? 'STALE_VERSION' : 'VALIDATION_FAILED', error.message); }
    const saved = await store.saveDecision({ eventRequestId, actor: req.actor, decision, reason: reason.trim(), version: Number(req.body.version), key, hash });
    if (saved.conflict) return sendError(res, 409, 'STALE_VERSION', 'This request was already decided or has changed. Reload before trying again.');
    return res.json(saved.result);
  }
  catch (error) { return next(error); }
});

module.exports = router;
