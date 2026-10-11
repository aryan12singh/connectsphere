const express = require('express');
const { requireAuth, requireAnyPermission } = require('../auth');
const repository = require('../store');
const { toEvent } = require('../serializers');
const { isOrganiser, isCoordinator } = require('../policy');
const config = require('../config');
const { history, load } = require('../workflows');
const prisma = require('../db');

const router = express.Router();
router.use(requireAuth());

function page(items, req) {
  const current = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  return { items: items.slice((current - 1) * pageSize, current * pageSize), page: current, pageSize, total: items.length };
}

router.get('/', requireAnyPermission('events.view'), async (req, res, next) => {
  try {
    const where = isOrganiser(req.actor) ? { organiserId: req.actor.id } : {};
    if (req.query.status) where.status = Array.isArray(req.query.status) ? req.query.status : [req.query.status];
    let events = await repository.listEvents(where);
    if (isCoordinator(req.actor)) {
      const visibleRequests = await repository.listRequests({ currentCoordinatorId: req.actor.id });
      const visibleIds = new Set(visibleRequests.map((request) => request.id));
      events = events.filter((event) => visibleIds.has(event.eventRequestId));
    }
    events = events.map(event => {
      const full = toEvent(event);
      return { id: full.id, title: full.title, status: full.status };
    });
    return res.json(page(events, req));
  } catch (error) { return next(error); }
});

router.get('/:id/activity', requireAnyPermission('events.view'), async (req, res, next) => {
  try {
    const events = await repository.listEvents({ id: req.params.id });
    const event = events[0];
    if (!event) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Event not found' } });
    const record = await repository.findRequest(event.eventRequestId);
    if (!record) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Event not found' } });
    const actor = {
      ...req.actor,
      roles: Array.isArray(req.actor.roles) ? req.actor.roles : (req.actor.role ? [req.actor.role] : []),
    };
    if (config.dataMode === 'prisma') return res.json(await history(actor, await load(prisma, record.id), req.query, true));

    const sameOrganisation = actor.permissions?.includes('event_requests.create')
      && actor.organisationId && actor.organisationId === record.organisationId;
    const assignedCoordinator = actor.permissions?.includes('event_requests.review')
      && actor.id === record.currentCoordinatorId && actor.id !== record.organiserId;
    if (!sameOrganisation && !assignedCoordinator) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to do this' } });
    }
    const items = (await repository.listActivity(record.id)).filter(item => item.details?.eventId === event.id);
    return res.json({ items, page: 1, pageSize: items.length, total: items.length, nextCursor: null });
  } catch (error) { return next(error); }
});

router.get('/:id/booking-access', async (req, res, next) => {
  try {
    const events = await repository.listEvents({ id: req.params.id });
    const event = events[0];
    if (!event) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Event not found' } });
    if (!isCoordinator(req.actor)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the assigned Coordinator may book this Event' } });
    const record = await repository.findRequest(event.eventRequestId);
    if (!record || record.currentCoordinatorId !== req.actor.id) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the assigned Coordinator may book this Event' } });
    return res.json({ id: event.id });
  } catch (error) { return next(error); }
});

router.get('/:id', requireAnyPermission('events.view'), async (req, res, next) => {
  try {
    const events = await repository.listEvents({ id: req.params.id });
    const event = events[0];
    if (!event) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Event not found' } });
    if (!isOrganiser(req.actor) && !isCoordinator(req.actor)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to do this' } });
    if (isOrganiser(req.actor) && event.organiserId !== req.actor.id) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to do this' } });
    if (isCoordinator(req.actor)) {
      const request = await repository.findRequest(event.eventRequestId);
      if (!request || request.currentCoordinatorId !== req.actor.id) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to do this' } });
    }
    return res.json(toEvent(event));
  } catch (error) { return next(error); }
});

module.exports = router;
