const express = require('express');
const { requireAuth, requireAnyPermission } = require('../auth');
const { decide, ACTIONS } = require('../domain/transitions');
const { pickCoordinator } = require('../domain/assignment');
const repository = require('../store');
const { toRequest } = require('../serializers');
const config = require('../config');
const { normaliseInput, validate } = require('../validation');
const { isOrganiser, isCoordinator, canRead } = require('../policy');
const { mutation: transactionalMutation } = require('../workflows');
const { history: workflowHistory, load: loadWorkflowRequest } = require('../workflows');
const prisma = require('../db');

const router = express.Router();
const REVIEW_QUEUE_STATUSES = ['SUBMITTED', 'RETURNED_FOR_AMENDMENT', 'APPROVED', 'REJECTED'];
router.use(requireAuth());
// Every request read or mutation is capability-gated. Relationship checks
// below decide which records the capability may be used against.
router.use(requireAnyPermission('event_requests.create', 'event_requests.review', 'events.view'));

function sendError(res, status, code, message, details) {
  return res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}

function page(items, req) {
  const current = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  return { items: items.slice((current - 1) * pageSize, current * pageSize), page: current, pageSize, total: items.length };
}

function workflowActor(actor) {
  return {
    ...actor,
    roles: Array.isArray(actor.roles) ? actor.roles : (actor.role ? [actor.role] : []),
    organisationId: actor.organisationId || null,
  };
}

async function runTransactionalMutation(req, res, next, mode, id, body = req.body) {
  if (config.dataMode !== 'prisma') return false;
  try {
    const workflowRequest = {
      actor: workflowActor(req.actor),
      body,
      method: req.method,
      path: req.path,
      get: req.get.bind(req),
    };
    const result = await transactionalMutation(workflowRequest, mode, id);
    if (result.replayed) res.set('Idempotency-Replayed', 'true');
    res.status(result.status).json(result.body);
  } catch (error) {
    if (error?.status) {
      const fields = error.fields || error.details?.fields;
      return res.status(error.status).json({ error: { code: error.code || 'REQUEST_FAILED', message: error.message, ...(fields ? { fields } : {}) } });
    }
    else next(error);
    return true;
  }
  return true;
}

async function coordinatorCandidates() {
  try {
    const response = await fetch(`${config.userServiceUrl}/internal/users?role=EVENT_COORDINATOR&page=1`, { headers: { 'x-internal-api-key': config.internalApiKey } });
    if (!response.ok) return [];
    const body = await response.json();
    return (body.users || []).filter(user => user.isActive !== false);
  } catch {
    return [];
  }
}

async function coordinatorById(coordinatorId) {
  try {
    const response = await fetch(`${config.userServiceUrl}/internal/users/${encodeURIComponent(coordinatorId)}`, { headers: { 'x-internal-api-key': config.internalApiKey } });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function organiserSummary(organiserId) {
  try {
    const response = await fetch(`${config.userServiceUrl}/internal/users/${encodeURIComponent(organiserId)}`, { headers: { 'x-internal-api-key': config.internalApiKey } });
    if (response.ok) {
      const user = await response.json();
      return { id: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || organiserId, email: user.email || '', company: user.company || '' };
    }
  } catch {}
  return { id: organiserId, name: organiserId, email: '', company: '' };
}

async function assignAutomatically(request, actorId) {
  const candidates = await coordinatorCandidates();
  const chosen = pickCoordinator(candidates, await repository.activeCounts());
  return chosen ? repository.assignCoordinator(request.id, chosen, null, 'AUTO') : null;
}

async function readable(actor, record) {
  return canRead(actor, record);
}

async function response(record, actor) {
  return toRequest(record, actor, await repository.currentAssignment(record.id));
}

router.get('/review-queue', requireAnyPermission('event_requests.review'), async (req, res, next) => {
  try {
    const requestedStatuses = Array.isArray(req.query.status)
      ? req.query.status
      : req.query.status ? [req.query.status] : REVIEW_QUEUE_STATUSES;
    const requests = await repository.listRequests({ status: requestedStatuses });
    const assigned = req.query.assigned === 'me'
      ? requests.filter(record => record.currentCoordinatorId === req.actor.id)
      : req.query.assigned === 'unassigned'
        ? requests.filter(record => !record.currentCoordinatorId && record.status === 'SUBMITTED')
        : requests.filter(record => record.currentCoordinatorId === req.actor.id || (!record.currentCoordinatorId && record.status === 'SUBMITTED'));
    const items = await Promise.all(assigned.map(async (record) => ({ ...(await response(record, req.actor)), organiser: await organiserSummary(record.organiserId) })));
    return res.json(page(items, req));
  } catch (error) { return next(error); }
});

router.post('/', requireAnyPermission('event_requests.create'), async (req, res, next) => {
  try {
    if (await runTransactionalMutation(req, res, next, 'create')) return;
    const idempotencyKey = req.get('Idempotency-Key');
    const prior = await repository.findIdempotency(req.actor.id, idempotencyKey, req.method, req.originalUrl);
    if (prior) {
      if (prior.requestHash !== repository.requestHash(req.body || {})) return sendError(res, 422, 'IDEMPOTENCY_KEY_REUSED', 'The Idempotency-Key was already used with a different request.');
      return res.status(prior.responseStatus || 201).json(prior.responseBody);
    }
    const fields = normaliseInput(req.body);
    // POST creates a draft; submission is an explicit, versioned transition.
    const status = 'DRAFT';
    const invalid = validate(fields, false);
    if (invalid) return sendError(res, 422, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', invalid);
    let record = await repository.createRequest({ organiserId: req.actor.id, organisationId: req.actor.organisationId || null, status, ...fields, submittedAt: null });
    await repository.addActivity({ eventRequestId: record.id, action: status === 'SUBMITTED' ? 'SUBMITTED' : 'REQUEST_CREATED', fromStatus: null, toStatus: status, actorType: 'USER', actorId: req.actor.id, details: null });
    const body = await response(record, req.actor);
    if (idempotencyKey) await repository.saveIdempotency({ userId: req.actor.id, key: idempotencyKey, method: req.method, path: req.originalUrl, requestHash: repository.requestHash(req.body || {}), responseStatus: 201, responseBody: body });
    return res.status(201).json(body);
  } catch (error) { return next(error); }
});

router.get('/', requireAnyPermission('events.view'), async (req, res, next) => {
  try {
    if (!req.actor.permissions?.includes('event_requests.create')) return sendError(res, 403, 'FORBIDDEN', 'You do not have permission to do this');
    const where = req.query.scope === 'organisation' && req.actor.organisationId
      ? { organisationId: req.actor.organisationId }
      : { organiserId: req.actor.id };
    const requestedStatuses = Array.isArray(req.query.status) ? req.query.status : req.query.status ? [req.query.status] : null;
    if (requestedStatuses) where.status = requestedStatuses;
    const requests = await repository.listRequests(where);
    const items = await Promise.all(requests.map(record => response(record, req.actor)));
    return res.json(page(items, req));
  } catch (error) { return next(error); }
});

router.get('/:id/activity', requireAnyPermission('events.view'), async (req, res, next) => {
  try {
    const record = await repository.findRequest(req.params.id);
    if (!record) return sendError(res, 404, 'NOT_FOUND', 'Event request not found');
    if (!(await readable(req.actor, record))) return sendError(res, 403, 'FORBIDDEN', 'You do not have permission to do this');
    if (config.dataMode === 'prisma') {
      const actor = workflowActor(req.actor);
      return res.json(await workflowHistory(actor, await loadWorkflowRequest(prisma, record.id), req.query));
    }
    const items = await repository.listActivity(record.id);
    return res.json(page(items, req));
  } catch (error) { return next(error); }
});

router.get('/:id/coordinator', requireAnyPermission('events.view'), async (req, res, next) => {
  try {
    const record = await repository.findRequest(req.params.id);
    if (!record) return sendError(res, 404, 'NOT_FOUND', 'Event request not found');
    if (!(await readable(req.actor, record))) return sendError(res, 403, 'FORBIDDEN', 'You do not have permission to do this');
    if (!record.currentCoordinatorId) return res.json(null);
    const coordinator = await coordinatorById(record.currentCoordinatorId);
    if (!coordinator) return sendError(res, 503, 'DEPENDENCY_UNAVAILABLE', 'Coordinator details are unavailable');
    return res.json(coordinator);
  } catch (error) { return next(error); }
});

router.post('/:id/submit', requireAnyPermission('event_requests.create'), async (req, res, next) => {
  try {
    if (await runTransactionalMutation(req, res, next, 'submit', req.params.id)) return;
    const record = await repository.findRequest(req.params.id);
    if (!record) return sendError(res, 404, 'NOT_FOUND', 'Event request not found');
    if (record.organiserId !== req.actor.id) return sendError(res, 403, 'FORBIDDEN', 'You do not have permission to do this');
    if (req.body?.version == null) return sendError(res, 422, 'VALIDATION_FAILED', 'Version is required.', { version: 'Version is required.' });
    if (record.status !== 'DRAFT') return sendError(res, 409, 'INVALID_TRANSITION', `Cannot submit when the status is ${record.status}`);
    const invalid = validate(record, true);
    if (invalid) return sendError(res, 422, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', invalid);
    let updated = await repository.updateRequest(record.id, { status: 'SUBMITTED', submittedAt: new Date() }, req.body?.version);
    if (!updated) return sendError(res, 409, 'STALE_VERSION', 'This request was changed by someone else. Reload and try again.');
    const assignment = await assignAutomatically(updated, req.actor.id);
    updated = await repository.findRequest(record.id);
    if (assignment) await repository.addActivity({ eventRequestId: record.id, action: 'COORDINATOR_ASSIGNED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED', actorType: 'SYSTEM', actorId: null, details: { coordinatorId: assignment.coordinatorId } });
    await repository.addActivity({ eventRequestId: record.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED', actorType: 'USER', actorId: req.actor.id, details: null });
    return res.json(await response(updated, req.actor));
  } catch (error) { return next(error); }
});

router.post('/:id/resubmit', requireAnyPermission('event_requests.create'), async (req, res, next) => {
  try {
    if (await runTransactionalMutation(req, res, next, 'resubmit', req.params.id)) return;
    const record = await repository.findRequest(req.params.id);
    if (!record) return sendError(res, 404, 'NOT_FOUND', 'Event request not found');
    if (record.organiserId !== req.actor.id) return sendError(res, 403, 'FORBIDDEN', 'You do not have permission to do this');
    if (req.body?.version == null) return sendError(res, 422, 'VALIDATION_FAILED', 'Version is required.', { version: 'Version is required.' });
    if (record.status !== 'RETURNED_FOR_AMENDMENT') return sendError(res, 409, 'INVALID_TRANSITION', `Cannot resubmit when the status is ${record.status}`);
    const updated = await repository.updateRequest(record.id, { status: 'SUBMITTED', submittedAt: new Date() }, req.body?.version);
    if (!updated) return sendError(res, 409, 'STALE_VERSION', 'This request was changed by someone else. Reload and try again.');
    await repository.addActivity({ eventRequestId: record.id, action: 'RESUBMITTED', fromStatus: 'RETURNED_FOR_AMENDMENT', toStatus: 'SUBMITTED', actorType: 'USER', actorId: req.actor.id, details: null });
    return res.json(await response(updated, req.actor));
  } catch (error) { return next(error); }
});

router.get('/:id', requireAnyPermission('events.view'), async (req, res, next) => {
  try {
    const record = await repository.findRequest(req.params.id);
    if (!record) return sendError(res, 404, 'NOT_FOUND', 'Event request not found');
    if (!(await readable(req.actor, record))) return sendError(res, 403, 'FORBIDDEN', 'You do not have permission to do this');
    return res.json(await response(record, req.actor));
  } catch (error) { return next(error); }
});

router.put('/:id', requireAnyPermission('event_requests.create'), async (req, res, next) => {
  try {
    if (await runTransactionalMutation(req, res, next, 'save', req.params.id)) return;
    const record = await repository.findRequest(req.params.id);
    if (!record) return sendError(res, 404, 'NOT_FOUND', 'Event request not found');
    if (record.organiserId !== req.actor.id) return sendError(res, 403, 'FORBIDDEN', 'You do not have permission to do this');
    if (req.body?.version == null) return sendError(res, 422, 'VALIDATION_FAILED', 'Version is required.', { version: 'Version is required.' });
    if (!['DRAFT', 'RETURNED_FOR_AMENDMENT'].includes(record.status)) return sendError(res, 409, 'INVALID_TRANSITION', `Cannot edit when the status is ${record.status}`);
    const fields = normaliseInput(req.body);
    const invalid = validate(fields, false);
    if (invalid) return sendError(res, 422, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', invalid);
    const updated = await repository.updateRequest(record.id, { ...fields }, req.body?.version);
    if (!updated) return sendError(res, 409, 'STALE_VERSION', 'This request was changed by someone else. Reload and try again.');
    await repository.addActivity({ eventRequestId: record.id, action: 'REQUEST_EDITED', fromStatus: record.status, toStatus: updated.status, actorType: 'USER', actorId: req.actor.id, details: null });
    return res.json(await response(updated, req.actor));
  } catch (error) { return next(error); }
});

router.post('/:id/decision', requireAnyPermission('event_requests.review'), async (req, res, next) => {
  try {
    const decisionActions = { approve: 'APPROVE', reject: 'REJECT', amendments: 'RETURN' };
    const workflowBody = {
      ...req.body,
      action: req.body?.action || decisionActions[req.body?.decision],
      text: req.body?.text || req.body?.notes || req.body?.comments || req.body?.reason,
    };
    if (await runTransactionalMutation(req, res, next, 'decision', req.params.id, workflowBody)) return;
    let record = await repository.findRequest(req.params.id);
    if (!record) return sendError(res, 404, 'NOT_FOUND', 'Event request not found');
    if (record.currentCoordinatorId && record.currentCoordinatorId !== req.actor.id) return sendError(res, 403, 'FORBIDDEN', 'Only the current Coordinator can do this.');
    if (!record.currentCoordinatorId) return sendError(res, 403, 'FORBIDDEN', 'Only the current Coordinator can do this.');
    if (req.body?.version == null) return sendError(res, 422, 'VALIDATION_FAILED', 'Version is required.', { version: 'Version is required.' });
    const actionMap = { approve: ACTIONS.APPROVE, reject: ACTIONS.REJECT, amendments: ACTIONS.RETURN };
    const action = actionMap[req.body?.decision];
    if (!action) return sendError(res, 422, 'VALIDATION_FAILED', 'Decision must be approve, reject or amendments.');
    const text = req.body?.reason || req.body?.comments || req.body?.notes;
    const result = decide({ action, entity: { scope: 'REQUEST', status: record.status }, actor: { id: req.actor.id, roles: isCoordinator(req.actor) ? ['EVENT_COORDINATOR'] : [] }, context: { organiserId: record.organiserId, currentCoordinatorId: record.currentCoordinatorId, startAt: record.startAt, endAt: record.endAt, timeZone: record.timeZone, now: new Date() }, text });
    let updated = await repository.updateRequest(record.id, { status: result.to, decidedById: req.actor.id, decidedAt: new Date(), decisionReason: result.activity.note }, req.body?.version);
    if (!updated) return sendError(res, 409, 'STALE_VERSION', 'This request was changed by someone else. Reload and try again.');
    if (result.createsEvent) {
      const eventRow = await repository.createEvent({ eventRequestId: record.id, organiserId: record.organiserId, organisationId: record.organisationId || null, title: record.eventName, description: record.description, startAt: record.startAt, endAt: record.endAt, timeZone: record.timeZone });
      updated = await repository.findRequest(record.id);
      await repository.addOutbox({ aggregateType: 'EventRequest', aggregateId: record.id, eventType: 'RequestApproved', payload: { eventRequestId: record.id, eventId: eventRow.id } });
    }
    await repository.addActivity({ eventRequestId: record.id, action: result.to, fromStatus: record.status, toStatus: result.to, actorType: 'USER', actorId: req.actor.id, details: { note: result.activity.note } });
    return res.json(await response(updated, req.actor));
  } catch (error) {
    if (error?.status) return sendError(res, error.status, error.code, error.message, error.details);
    return next(error);
  }
});

router.post('/:id/reassign', requireAnyPermission('event_requests.review'), async (req, res, next) => {
  try {
    const record = await repository.findRequest(req.params.id);
    if (!record) return sendError(res, 404, 'NOT_FOUND', 'Event request not found');
    const targetId = typeof req.body?.coordinatorId === 'string' ? req.body.coordinatorId.trim() : '';
    if (!targetId || req.body?.version == null) return sendError(res, 422, 'VALIDATION_FAILED', 'Coordinator and version are required.');
    if (!['SUBMITTED', 'RETURNED_FOR_AMENDMENT', 'APPROVED'].includes(record.status)) return sendError(res, 409, 'INVALID_TRANSITION', `Cannot reassign when the status is ${record.status}`);
    if (record.currentCoordinatorId && record.currentCoordinatorId !== req.actor.id) return sendError(res, 403, 'FORBIDDEN', 'Only the current Coordinator can do this.');
    if (!record.currentCoordinatorId && targetId !== req.actor.id) return sendError(res, 403, 'FORBIDDEN', 'An unassigned request can only be claimed by you.');
    if (record.currentCoordinatorId === targetId) return sendError(res, 422, 'VALIDATION_FAILED', 'The new Coordinator must be different.');
    const target = await coordinatorById(targetId);
    if (target && (target.isActive === false || target.role !== 'EVENT_COORDINATOR')) return sendError(res, 422, 'VALIDATION_FAILED', 'The target user must be an active Coordinator.');
    const updated = await repository.updateRequest(record.id, {}, req.body.version);
    if (!updated) return sendError(res, 409, 'STALE_VERSION', 'This request was changed by someone else. Reload and try again.');
    await repository.assignCoordinator(record.id, targetId, req.actor.id, 'REASSIGNED');
    const result = await repository.findRequest(record.id);
    await repository.addActivity({ eventRequestId: record.id, action: 'COORDINATOR_REASSIGNED', fromStatus: record.status, toStatus: record.status, actorType: 'USER', actorId: req.actor.id, details: { fromCoordinatorId: record.currentCoordinatorId, toCoordinatorId: targetId } });
    return res.json(await response(result, req.actor));
  } catch (error) { return next(error); }
});

module.exports = router;
