const express = require('express');
const { requireAuth, requireAnyPermission } = require('../auth');
const repository = require('../store');
const { toEvent } = require('../serializers');
const { isOrganiser, isCoordinator } = require('../policy');

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
    events = events.map(toEvent);
    return res.json(page(events, req));
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
