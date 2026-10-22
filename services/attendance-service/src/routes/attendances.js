const express = require('express');
const { requireAuth } = require('../auth');
const { isEventVisible, filterAttendeeFields, filterOrganiserFields } = require('../domain/attendance');
const { canReadOwnRegistration } = require('../domain/registration');
const store = require('../store');
const projection=require('../projection');

const router = express.Router();
router.use(requireAuth());

// Event creation and registration policy commands retain their service owners.
router.post('/events', (_req, res) => res.set('Allow','GET').status(405).json({error:{code:'METHOD_NOT_ALLOWED',message:'Event details are read from their authoritative services. Public Event writes are not supported.'}}));

function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

router.get('/events', async (_req, res, next) => {
  try {
    const events = await projection.list();
    return res.json({ events: events.map(store.eventView) });
  }
  catch (error) { return next(error); }
});

router.get('/events/:id', async (req, res, next) => {
  try {
    const event = await projection.find(req.params.id);
    if (!event) return sendError(res, 404, 'NOT_FOUND', 'Event not found.');
    if (!isEventVisible(event.status)) return sendError(res, 404, 'NOT_FOUND', 'Event not found.');
    return res.json(filterAttendeeFields(store.eventView(event)));
  }
  catch (error) { return next(error); }
});

router.get('/events/:id/organiser', async (req, res, next) => {
  try {
    const event = await projection.find(req.params.id);
    if (!event) return sendError(res, 404, 'NOT_FOUND', 'Event not found.');
    if (![req.actor.role,...(req.actor.roles||[])].includes('EVENT_ORGANISER')||event.organiserId!==req.actor.id) return sendError(res, 403, 'FORBIDDEN', 'Only this Event owner can open its Organiser detail.');
    return res.json(filterOrganiserFields(store.eventView(event)));
  }
  catch (error) { return next(error); }
});

router.get('/registrations/:eventId', async (req, res, next) => {
  try {
    const event = await store.findEvent(req.params.eventId);
    if (!event) return sendError(res, 404, 'NOT_FOUND', 'Event not found.');
    const registration = await store.findRegistration(req.params.eventId, req.actor.id);
    if (!registration) return sendError(res, 404, 'NOT_FOUND', 'Registration not found.');
    if (!canReadOwnRegistration(event, [registration], registration.userId, req.actor.id)) {
      return sendError(res, 403, 'FORBIDDEN', 'You do not have permission to view this registration.');
    }
    return res.json(registration);
  }
  catch (error) { return next(error); }
});

module.exports = router;
