const express = require('express');
const { requireAuth, requireAnyPermission, requirePermission } = require('../auth');
const { decide, ACTIONS } = require('../domain/transitions');
const repository = require('../store');
const { toRequest } = require('../serializers');
const config = require('../config');
const { normaliseInput, validate } = require('../validation');
const { isOrganiser, isCoordinator, canRead, countsAsActive } = require('../policy');
const { displayStatus } = require('../domain/statusLabels');
const { mutation: transactionalMutation } = require('../workflows');
const { history: workflowHistory, load: loadWorkflowRequest, read: workflowRead, dto: workflowDto } = require('../workflows');
const prisma = require('../db');

const router = express.Router();
const REVIEW_QUEUE_STATUSES = ['SUBMITTED', 'RETURNED_FOR_AMENDMENT', 'APPROVED', 'REJECTED'];
router.use(requireAuth());
// Every route below names the exact permission(s) it needs. Relationship checks
// (owner, assigned Coordinator) then decide which records they apply to.

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

// Active Coordinators from user-service (it pages 25 at a time).
async function coordinatorCandidates() {
  const found = [];
  try {
    for (let pageNumber = 1; pageNumber <= 20; pageNumber += 1) {
      const response = await fetch(`${config.userServiceUrl}/internal/users?role=EVENT_COORDINATOR&page=${pageNumber}`, { headers: { 'x-internal-api-key': config.internalApiKey } });
      if (!response.ok) break;
      const body = await response.json();
      found.push(...(body.users || []));
      if (found.length >= (body.total || 0) || !(body.users || []).length) break;
    }
  } catch { /* an unreachable directory means "no candidates", never a crash */ }
  return found.filter(user => user.isActive !== false);
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

async function readable(actor, record) {
  return canRead(actor, record);
}

async function response(record, actor) {
  return toRequest(record, actor, await repository.currentAssignment(record.id));
}

// In database mode a read goes through the same load -> access check -> dto
// path as the writes, so a GET returns exactly what the last write returned.
async function prismaRead(req, id) {
  const record = await loadWorkflowRequest(prisma, id);
  workflowRead(workflowActor(req.actor), record);
  return workflowDto(record);
}

router.get('/review-queue', requirePermission('events.view', 'event_requests.review'), async (req, res, next) => {
  try {
    const requestedStatuses = Array.isArray(req.query.status)
      ? req.query.status
      : req.query.status ? [req.query.status] : REVIEW_QUEUE_STATUSES;
    const requests = await repository.listRequests({ status: requestedStatuses });
    // Week 7: a Coordinator's queue holds only requests assigned to them. Queued
    // (unassigned) requests belong to the Lead's queue, never to a Coordinator.
    const assigned = requests.filter(record => record.currentCoordinatorId === req.actor.id);
    const items = await Promise.all(assigned.map(async (record) => ({ ...(await response(record, req.actor)), organiser: await organiserSummary(record.organiserId) })));
    return res.json(page(items, req));
  } catch (error) { return next(error); }
});

router.post('/', requirePermission('event_requests.create'), async (req, res, next) => {
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

// Coordinators a request can be handed to (names for the "Change coordinator"
// dropdown). Names live in user-service, so event-service passes them through
// and the browser never talks to user-service directly.
router.get('/coordinators', requirePermission('events.view', 'assignments.view'), async (req, res, next) => {
  try {
    const items = (await coordinatorCandidates()).map(user => ({ id: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || user.id, email: user.email || '' }));
    return res.json({ items });
  } catch (error) { return next(error); }
});

// ── Week 7 (CS-81, CS-30): the Coordinator Lead's queue and assignment ─────────
// Every route here needs assignments.view, which only the Lead role holds, so a
// Coordinator, Organiser or any other role gets 403.
function leadItem(record, organiser, allowedActions) {
  return {
    id: record.id,
    eventName: record.eventName || '',
    status: record.status,
    version: record.version,
    organiser,
    submittedAt: record.submittedAt || null,
    startAt: record.startAt || null,
    endAt: record.endAt || null,
    timeZone: record.timeZone || '',
    expectedAttendance: record.expectedAttendance ?? null,
    purpose: record.purpose || '',
    venueType: record.venueType || null,
    currentCoordinatorId: record.currentCoordinatorId || null,
    allowedActions,
  };
}
const submittedTime = record => new Date(record.submittedAt || record.createdAt).getTime();

// The unassigned queue: submitted, no Coordinator yet, oldest first.
router.get('/unassigned', requirePermission('assignments.view'), async (req, res, next) => {
  try {
    const queued = (await repository.listRequests({ status: ['SUBMITTED'] }))
      .filter(record => !record.currentCoordinatorId)
      .sort((a, b) => submittedTime(a) - submittedTime(b) || (a.id < b.id ? -1 : 1));
    const items = await Promise.all(queued.map(async record => leadItem(record, await organiserSummary(record.organiserId), ['assign'])));
    return res.json(page(items, req));
  } catch (error) { return next(error); }
});

// Open requests this Lead assigned, so the Lead can reassign them.
router.get('/assigned-by-me', requirePermission('assignments.view'), async (req, res, next) => {
  try {
    const mine = (await repository.listAssignedBy(req.actor.id))
      .filter(record => ['SUBMITTED', 'RETURNED_FOR_AMENDMENT'].includes(record.status) || (record.status === 'APPROVED' && ['ARRANGEMENT_PENDING', 'CONFIRMED', 'PREPARATION'].includes(record.event?.status)))
      .sort((a, b) => submittedTime(a) - submittedTime(b) || (a.id < b.id ? -1 : 1));
    const items = await Promise.all(mine.map(async record => leadItem(record, await organiserSummary(record.organiserId), ['reassign'])));
    return res.json(page(items, req));
  } catch (error) { return next(error); }
});

// ── CS-83: the Lead's oversight of active Events ─────────────────────────────
// Read-only. Lists Events and requests that currently have a Coordinator and are
// still open (Under Review, Returned for Amendment, Planning, Confirmed,
// Preparation, Cancelling). Private Drafts, Rejected, Cancelled and Completed
// records never appear. Supervisory scopes are not recorded yet, so every Lead
// sees every active assignment; that gap is listed in the CS-83 follow-ups.
const OVERSIGHT_STAGES = ['SUBMITTED', 'RETURNED_FOR_AMENDMENT', 'ARRANGEMENT_PENDING', 'CONFIRMED', 'PREPARATION', 'CANCELLING'];
const REASSIGNABLE_EVENT_STATUSES = ['ARRANGEMENT_PENDING', 'CONFIRMED', 'PREPARATION'];
// One stage per record: the Event's status once the request is approved.
function stageOf(record) { return record.status === 'APPROVED' ? (record.event?.status || 'APPROVED') : record.status; }
function canReassignRecord(record) {
  return record.status === 'SUBMITTED' || record.status === 'RETURNED_FOR_AMENDMENT'
    || (record.status === 'APPROVED' && REASSIGNABLE_EVENT_STATUSES.includes(record.event?.status));
}
// What is still open, from what Event Service itself knows. Venue and equipment
// proofs live in other services and join this list with the CS-32 checklist.
function outstandingFor(record) {
  const stage = stageOf(record);
  if (stage === 'SUBMITTED') return ['Coordinator decision'];
  if (stage === 'RETURNED_FOR_AMENDMENT') return ['Organiser amendments'];
  if (stage === 'CANCELLING') return ['Cancellation releases in progress'];
  if (stage !== 'ARRANGEMENT_PENDING') return [];
  const safety = record.event?.safetyState || 'NOT_SUBMITTED';
  if (safety === 'APPROVED') return ['Event confirmation'];
  if (safety === 'PENDING') return ['Safety review in progress'];
  if (safety === 'CHANGES_REQUIRED') return ['Safety changes requested'];
  if (safety === 'STALE') return ['Safety re-review needed'];
  return ['Venue and technical arrangements', 'Safety review'];
}
function oversightSort(a, b) {
  const left = a.startAt ? new Date(a.startAt).getTime() : Infinity;
  const right = b.startAt ? new Date(b.startAt).getTime() : Infinity;
  return left - right || (a.id < b.id ? -1 : 1);
}

router.get('/oversight', requirePermission('assignments.view'), async (req, res, next) => {
  try {
    const coordinatorFilter = typeof req.query.coordinatorId === 'string' ? req.query.coordinatorId.trim() : '';
    const stageFilter = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    if (stageFilter && !OVERSIGHT_STAGES.includes(stageFilter)) return sendError(res, 422, 'VALIDATION_FAILED', 'Unknown status filter.', { status: `Use one of ${OVERSIGHT_STAGES.join(', ')}.` });
    const active = (await repository.listRequests())
      .filter(record => record.currentCoordinatorId && countsAsActive({ requestStatus: record.status, eventStatus: record.event?.status }));
    // Workload counts the whole active set, so filtering never changes a Coordinator's total.
    const counts = {};
    for (const record of active) counts[record.currentCoordinatorId] = (counts[record.currentCoordinatorId] || 0) + 1;
    const known = new Map((await coordinatorCandidates()).map(user => [user.id, [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || user.id]));
    const workload = [...new Set([...known.keys(), ...Object.keys(counts)])]
      .map(id => ({ coordinatorId: id, name: known.get(id) || 'Unavailable Coordinator', active: counts[id] || 0 }))
      .sort((a, b) => b.active - a.active || a.name.localeCompare(b.name) || (a.coordinatorId < b.coordinatorId ? -1 : 1));
    const matching = active
      .filter(record => !coordinatorFilter || record.currentCoordinatorId === coordinatorFilter)
      .filter(record => !stageFilter || stageOf(record) === stageFilter)
      .sort(oversightSort);
    const paged = page(matching, req);
    paged.items = await Promise.all(paged.items.map(async record => ({
      ...leadItem(record, await organiserSummary(record.organiserId), canReassignRecord(record) ? ['reassign'] : []),
      stage: stageOf(record),
      statusLabel: displayStatus({ requestStatus: record.status, eventStatus: record.event?.status }),
      eventId: record.event?.id || null,
      outstanding: outstandingFor(record),
    })));
    return res.json({ ...paged, workload, stages: OVERSIGHT_STAGES.map(value => ({ value, label: displayStatus(value === 'SUBMITTED' || value === 'RETURNED_FOR_AMENDMENT' ? { requestStatus: value } : { requestStatus: 'APPROVED', eventStatus: value }) })) });
  } catch (error) { return next(error); }
});

router.post('/:id/assign', requirePermission('assignments.view'), async (req, res, next) => {
  try {
    if (await runTransactionalMutation(req, res, next, 'assign', req.params.id)) return;
    const record = await repository.findRequest(req.params.id);
    if (!record) return sendError(res, 404, 'NOT_FOUND', 'Event request not found');
    const targetId = typeof req.body?.coordinatorId === 'string' ? req.body.coordinatorId.trim() : '';
    if (!targetId || req.body?.version == null) return sendError(res, 422, 'VALIDATION_FAILED', 'Coordinator and version are required.');
    if (record.status !== 'SUBMITTED' || record.currentCoordinatorId) return sendError(res, 409, 'INVALID_TRANSITION', 'Only a queued request without a Coordinator can be assigned');
    if (targetId === record.organiserId) return sendError(res, 422, 'VALIDATION_FAILED', 'An Organiser cannot coordinate their own request.');
    const target = await coordinatorById(targetId);
    if (target && (target.isActive === false || !(target.roles || [target.role]).includes('EVENT_COORDINATOR'))) return sendError(res, 422, 'VALIDATION_FAILED', 'The target user must be an active Coordinator.');
    const updated = await repository.updateRequest(record.id, {}, req.body.version);
    if (!updated) return sendError(res, 409, 'STALE_VERSION', 'This request was changed by someone else. Reload and try again.');
    await repository.assignCoordinator(record.id, targetId, req.actor.id, 'ASSIGNED');
    const result = await repository.findRequest(record.id);
    await repository.addActivity({ eventRequestId: record.id, action: 'COORDINATOR_ASSIGNED', fromStatus: record.status, toStatus: record.status, actorType: 'USER', actorId: req.actor.id, details: { toCoordinatorId: targetId } });
    await repository.addOutbox({ aggregateType: 'EventRequest', aggregateId: record.id, eventType: 'CoordinatorAssigned', payload: { eventRequestId: record.id, organiserId: record.organiserId, coordinatorId: targetId, eventName: record.eventName, actorId: req.actor.id } });
    return res.json(await response(result, req.actor));
  } catch (error) { return next(error); }
});

router.get(['/', '/drafts'], requirePermission('events.view'), async (req, res, next) => {
  try {
    if (!isOrganiser(req.actor)) return sendError(res, 403, 'FORBIDDEN', 'Only Organisers may list their requests');
    // Private request lists are always the caller's own. Organisation-wide
    // visibility applies to published Events, not to the requests behind them.
    const where = { organiserId: req.actor.id };
    if (req.path === '/drafts') where.status = 'DRAFT';
    else if (req.query.status) where.status = Array.isArray(req.query.status) ? req.query.status : [req.query.status];
    const requests = await repository.listRequests(where);
    const items = config.dataMode === 'prisma'
      ? requests.map(workflowDto)
      : await Promise.all(requests.map(record => response(record, req.actor)));
    return res.json(page(items, req));
  } catch (error) { return next(error); }
});

// A deliberately narrow metadata projection for the Technical Support queue.
// It does not confer general event visibility and never returns submission time.
router.get('/technical-metadata', requirePermission('events.technical.metadata.view'), async (req, res, next) => {
  try {
    const ids = [...new Set(String(req.query.ids || '').split(',').filter(Boolean))].slice(0, 100);
    const items = await Promise.all(ids.map(async id => {
      const record = await repository.findRequest(id);
      if (!record) return null;
      const coordinator = record.currentCoordinatorId ? await coordinatorById(record.currentCoordinatorId) : null;
      return {
        eventRequestId: record.id,
        title: record.eventName,
        startAt: record.startAt,
        endAt: record.endAt,
        timeZone: record.timeZone || 'UTC',
        submitter: { id: record.currentCoordinatorId || '', name: coordinator ? ([coordinator.firstName, coordinator.lastName].filter(Boolean).join(' ') || coordinator.email || coordinator.id) : (record.currentCoordinatorId || 'Unknown') },
      };
    }));
    return res.json({ items: items.filter(Boolean) });
  } catch (error) { return next(error); }
});

router.get('/:id/activity', requirePermission('events.view'), async (req, res, next) => {
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

router.get('/:id/coordinator', requirePermission('events.view'), async (req, res, next) => {
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

router.post('/:id/submit', requirePermission('event_requests.create'), async (req, res, next) => {
  try {
    if (await runTransactionalMutation(req, res, next, 'submit', req.params.id)) return;
    const record = await repository.findRequest(req.params.id);
    if (!record) return sendError(res, 404, 'NOT_FOUND', 'Event request not found');
    if (record.organiserId !== req.actor.id) return sendError(res, 403, 'FORBIDDEN', 'You do not have permission to do this');
    if (req.body?.version == null) return sendError(res, 422, 'VALIDATION_FAILED', 'Version is required.', { version: 'Version is required.' });
    if (record.status !== 'DRAFT') return sendError(res, 409, 'INVALID_TRANSITION', `Cannot submit when the status is ${record.status}`);
    const invalid = validate(record, true);
    if (invalid) return sendError(res, 422, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', invalid);
    const updated = await repository.updateRequest(record.id, { status: 'SUBMITTED', submittedAt: new Date() }, req.body?.version);
    if (!updated) return sendError(res, 409, 'STALE_VERSION', 'This request was changed by someone else. Reload and try again.');
    // Week 7: a first submission stays unassigned and waits in the Lead's queue.
    await repository.addActivity({ eventRequestId: record.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED', actorType: 'USER', actorId: req.actor.id, details: null });
    return res.json(await response(updated, req.actor));
  } catch (error) { return next(error); }
});

router.post('/:id/resubmit', requirePermission('event_requests.create'), async (req, res, next) => {
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

router.get('/:id', requirePermission('events.view'), async (req, res, next) => {
  try {
    if (config.dataMode === 'prisma') return res.json(await prismaRead(req, req.params.id));
    const record = await repository.findRequest(req.params.id);
    if (!record) return sendError(res, 404, 'NOT_FOUND', 'Event request not found');
    if (!(await readable(req.actor, record))) return sendError(res, 403, 'FORBIDDEN', 'You do not have permission to do this');
    return res.json(await response(record, req.actor));
  } catch (error) { return next(error); }
});

// PUT and PATCH are the same save operation (the contract documents both).
for (const method of ['put', 'patch']) router[method]('/:id', requirePermission('event_requests.create'), async (req, res, next) => {
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

// CS-43: the assigned Coordinator corrects routine wording (description only for now).
router.post('/:id/coordinator-edit', requirePermission('event_requests.review'), async (req, res, next) => {
  try {
    if (await runTransactionalMutation(req, res, next, 'coordinatorEdit', req.params.id)) return;
    return sendError(res, 501, 'NOT_IMPLEMENTED', 'Coordinator edit needs the database mode');
  } catch (error) { return next(error); }
});

router.post('/:id/decision', requirePermission('event_requests.review'), async (req, res, next) => {
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

router.post('/:id/reassign', requirePermission('assignments.view'), async (req, res, next) => {
  try {
    if (await runTransactionalMutation(req, res, next, 'reassign', req.params.id)) return;
    const record = await repository.findRequest(req.params.id);
    if (!record) return sendError(res, 404, 'NOT_FOUND', 'Event request not found');
    const targetId = typeof req.body?.coordinatorId === 'string' ? req.body.coordinatorId.trim() : '';
    if (!targetId || req.body?.version == null) return sendError(res, 422, 'VALIDATION_FAILED', 'Coordinator and version are required.');
    if (!['SUBMITTED', 'RETURNED_FOR_AMENDMENT', 'APPROVED'].includes(record.status)) return sendError(res, 409, 'INVALID_TRANSITION', `Cannot reassign when the status is ${record.status}`);
    if (!record.currentCoordinatorId) return sendError(res, 409, 'INVALID_TRANSITION', 'This request has no Coordinator yet. Assign one first.');
    if (record.currentCoordinatorId === targetId) return sendError(res, 422, 'VALIDATION_FAILED', 'The new Coordinator must be different.');
    const target = await coordinatorById(targetId);
    if (target && (target.isActive === false || !(target.roles || [target.role]).includes('EVENT_COORDINATOR'))) return sendError(res, 422, 'VALIDATION_FAILED', 'The target user must be an active Coordinator.');
    const updated = await repository.updateRequest(record.id, {}, req.body.version);
    if (!updated) return sendError(res, 409, 'STALE_VERSION', 'This request was changed by someone else. Reload and try again.');
    await repository.assignCoordinator(record.id, targetId, req.actor.id, 'REASSIGNED');
    const result = await repository.findRequest(record.id);
    await repository.addActivity({ eventRequestId: record.id, action: 'COORDINATOR_REASSIGNED', fromStatus: record.status, toStatus: record.status, actorType: 'USER', actorId: req.actor.id, details: { fromCoordinatorId: record.currentCoordinatorId, toCoordinatorId: targetId } });
    return res.json(await response(result, req.actor));
  } catch (error) { return next(error); }
});

module.exports = router;
