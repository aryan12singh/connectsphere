const express = require('express');
const { requireAuth } = require('../auth');
const { isEventVisible, filterAttendeeFields, filterOrganiserFields } = require('../domain/attendance');
const { getPrimaryVenue, getEffectiveVenues, excludeObsoleteBookings } = require('../domain/venues');
const { computeRegistrationLimit, isRegistrationOpen, canReadOwnRegistration } = require('../domain/registration');
const store = require('../store');

const router = express.Router();
router.use(requireAuth());

router.post('/events', async (req, res, next) => {
  try {
    const event = await store.saveEvent(req.body);
    return res.status(201).json(event);
  }
  catch (error) { return next(error); }
});

function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

router.get('/events', async (_req, res, next) => {
  try {
    const events = await store.listEvents();
    return res.json({ events: events.map(store.eventView) });
  }
  catch (error) { return next(error); }
});

router.get('/events/:id', async (req, res, next) => {
  try {
    const event = await store.findEvent(req.params.id);
    if (!event) return sendError(res, 404, 'NOT_FOUND', 'Event not found.');
    if (!isEventVisible(event.status)) return sendError(res, 404, 'NOT_FOUND', 'Event not found.');
    const actorRole = req.actor.role;
    const view = actorRole === 'EVENT_ORGANISER' ? filterOrganiserFields(event) : filterAttendeeFields(event);
    return res.json(view);
  }
  catch (error) { return next(error); }
});

router.get('/events/:id/organiser', async (req, res, next) => {
  try {
    const event = await store.findEvent(req.params.id);
    if (!event) return sendError(res, 404, 'NOT_FOUND', 'Event not found.');
    if (req.actor.role !== 'EVENT_ORGANISER') return sendError(res, 403, 'FORBIDDEN', 'Only organisers can view all venues.');
    return res.json(filterOrganiserFields(event));
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
