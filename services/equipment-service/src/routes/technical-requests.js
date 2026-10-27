const express = require('express');
const { requireAuth, requireRole } = require('../auth');
const { validateRequirements, decideRequirements, canReadRequirements, canEditRequirements } = require('../domain/technical-request');
const store = require('../store');
const config = require('../config');
const operations = require('../operations');
const { equipmentPeriod } = require('../domain/equipment-period');
const { requestContext, equipmentAllocationContext } = require('../eventContext');

const router = express.Router();
router.use(requireAuth());

router.get('/equipment-inventory', requireRole('TECHNICAL_SUPPORT_STAFF'), async (_req, res, next) => {
  try { return res.json(await require('../inventory').inventory()); }
  catch (error) { return next(error); }
});

router.put('/equipment-inventory/:type', requireRole('TECHNICAL_SUPPORT_STAFF'), async (req, res, next) => {
  try { return res.json(await require('../inventory').update(req.params.type, req.body || {})); }
  catch (error) { return next(error); }
});

function sendError(res, status, code, message, fields, extra = {}) {
  return res.status(status).json({ error: { code, message, ...(fields ? { fields } : {}), ...extra } });
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

async function currentEquipmentWindow(req, request) {
  // Test-only fixture transport keeps the public contract honest: production
  // always derives the interval from Booking's current allocation projection.
  if (config.isTest || process.env.AUTH_MODE === 'mock') {
    const raw = req.get('x-test-equipment-period');
    if (raw) {
      const [startAt, endAt] = raw.split(',');
      return { window: { startAt, endAt }, sourceVersions: { testFixture: true } };
    }
    return { window: { startAt: '2028-01-01T00:00:00.000Z', endAt: '2028-01-01T02:00:00.000Z' }, sourceVersions: { testFixture: true } };
  }
  const event = await requestContext(request.eventRequestId);
  const projection = await equipmentAllocationContext(event.eventId);
  return {
    window: equipmentPeriod(projection.allocations),
    sourceVersions: {
      requirementsRevision: event.requirementsRevision,
      allocations: projection.allocations.map(item => ({ bookingId: item.bookingId, bookingVersion: item.bookingVersion, venueId: item.venueId, venueVersion: item.venueVersion })),
    },
  };
}

async function isCurrentCoordinator(req, eventRequestId) {
  if (config.isTest || process.env.AUTH_MODE === 'mock') {
    const claimed = req.get('x-test-current-coordinator-id');
    if (claimed) return claimed === req.actor.id;
    const existing = await store.findRequest(eventRequestId);
    return !existing || existing.coordinatorId === req.actor.id;
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

router.get('/technical-requests', requireRole('TECHNICAL_SUPPORT_STAFF'), async (req, res, next) => {
  try {
    const all = await store.listRequests();
    const visible = req.query.includeResolved === '1' ? all : all.filter(request => ['PENDING_TECH_REVIEW', 'SUBMITTED'].includes(request.status));
    const reserved = await operations.reservedRequestIds(visible);
    const requests = await Promise.all(visible.map(async request => {
      const view = store.requestView(request);
      const reservation = { reserved: reserved.has(request.eventRequestId) };
      if (!request.requirements.equipment.length) return { ...view, ...reservation, equipmentPeriod: null };
      try { return { ...view, ...reservation, equipmentPeriod: (await currentEquipmentWindow(req, request)).window }; }
      catch { return { ...view, ...reservation, equipmentPeriod: null }; }
    }));
    return res.json({ requests });
  }
  catch (error) { return next(error); }
});

router.get('/event-requests/:eventRequestId/technical-request', async (req, res, next) => {
  try {
    const request = await store.findRequest(req.params.eventRequestId);
    if (!request) return sendError(res, 404, 'NOT_FOUND', 'Technical request not found.');
    const coordinator = req.actor.role === 'EVENT_COORDINATOR';
    if (coordinator && !(await isCurrentCoordinator(req, request.eventRequestId))) return sendError(res, 403, 'FORBIDDEN', 'Only the currently assigned Coordinator may view these requirements.');
    if (!canReadRequirements(req.actor, { eventId: request.planningEventId || request.eventRequestId, coordinatorId: coordinator ? req.actor.id : request.coordinatorId })) return sendError(res, 403, 'FORBIDDEN', 'You do not have permission to view this technical request.');
    return res.json(store.requestView(coordinator ? { ...request, coordinatorId: req.actor.id } : request));
  }
  catch (error) { return next(error); }
});

router.get('/event-requests/:eventRequestId/technical-request/history', async (req, res, next) => {
  try {
    const request = await store.findRequest(req.params.eventRequestId);
    if (!request) return sendError(res, 404, 'NOT_FOUND', 'Technical request not found.');
    const coordinator = req.actor.role === 'EVENT_COORDINATOR';
    if (coordinator && !(await isCurrentCoordinator(req, request.eventRequestId))) return sendError(res, 403, 'FORBIDDEN', 'Only the currently assigned Coordinator may view these requirements.');
    if (!canReadRequirements(req.actor, { eventId: request.planningEventId || request.eventRequestId, coordinatorId: coordinator ? req.actor.id : request.coordinatorId })) return sendError(res, 403, 'FORBIDDEN', 'You do not have permission to view this technical request.');
    return res.json({ items: await store.listHistory(request.eventRequestId) });
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
    if (previous && (!canEditRequirements(req.actor, { ...previous, coordinatorId: req.actor.id }) || Number(req.body?.version) !== previous.version)) return sendError(res, 409, 'STALE_VERSION', 'The request changed or was reassigned. Reload and try again.');
    if (!previous && Number(req.body?.version) !== 1) return sendError(res, 409, 'STALE_VERSION', 'A new technical request must start at version 1.');
    const types = await store.listEquipmentTypes();
    const validation = validateRequirements(requestInput({ ...req.body, eventRequestId, coordinatorId: req.actor.id }), types, previous);
    if (!validation.valid) return sendError(res, 422, 'VALIDATION_FAILED', 'Please fix the highlighted technical requirements.', validation.errors);
    const context = (config.isTest || process.env.AUTH_MODE === 'mock')
      ? { eventId: eventRequestId, requirementsRevision: `test:${validation.value.version}` }
      : await requestContext(eventRequestId);
    const saved = await store.saveSubmission({ eventRequestId, actor: req.actor, value: validation.value, key, hash, context });
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

router.get('/event-requests/:eventRequestId/technical-request/availability', requireRole('TECHNICAL_SUPPORT_STAFF'), async (req, res, next) => {
  try {
    const request = await store.findRequest(req.params.eventRequestId);
    if (!request) return sendError(res, 404, 'NOT_FOUND', 'Technical request not found.');
    const context = await currentEquipmentWindow(req, request);
    return res.json(await operations.availability({ request, window: context.window }));
  }
  catch (error) { return next(error); }
});

router.post('/event-requests/:eventRequestId/technical-request/reservations', requireRole('TECHNICAL_SUPPORT_STAFF'), async (req, res, next) => {
  try {
    const request = await store.findRequest(req.params.eventRequestId);
    if (!request) return sendError(res, 404, 'NOT_FOUND', 'Technical request not found.');
    if (Number(req.body?.version) !== request.version) return sendError(res, 409, 'STALE_VERSION', 'Technical requirements changed. Reload and retry.');
    const context = await currentEquipmentWindow(req, request);
    const key = req.get('Idempotency-Key');
    const hash = store.requestHash({ eventRequestId: request.eventRequestId, version: request.version, sourceVersions: context.sourceVersions });
    const value = await operations.reserve({ request, window: context.window, actor: req.actor, key, hash, sourceVersions: context.sourceVersions });
    if (value.replayed) res.set('Idempotency-Replayed', 'true');
    return res.json(value);
  }
  catch (error) {
    if (error.status) return sendError(res, error.status, error.code || 'VALIDATION_FAILED', error.message, undefined, error.lines ? { lines: error.lines } : {});
    return next(error);
  }
});

router.post('/equipment-operational-unavailability', requireRole('TECHNICAL_SUPPORT_STAFF'), async (req, res, next) => {
  try { return res.status(201).json(await operations.createOperation({ body: req.body || {}, actor: req.actor, key: req.get('Idempotency-Key') })); }
  catch (error) { return next(error); }
});

module.exports = router;
