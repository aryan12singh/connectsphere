const express = require('express');
const { requireAuth } = require('../auth');
const { isEventVisible, filterAttendeeFields, filterOrganiserFields } = require('../domain/attendance');
const { canReadOwnRegistration } = require('../domain/registration');
const { placesRemaining } = require('../domain/registration');
const store = require('../store');
const projection=require('../projection');
const eventClient=require('../eventClient');

const router = express.Router();
router.use(requireAuth());

// Event creation and registration policy commands retain their service owners.
router.post('/events', (_req, res) => res.set('Allow','GET').status(405).json({error:{code:'METHOD_NOT_ALLOWED',message:'Event details are read from their authoritative services. Public Event writes are not supported.'}}));

function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function hasRole(actor, role) {
  return actor?.role === role || (Array.isArray(actor?.roles) && actor.roles.includes(role));
}

async function publicEventView(event) {
  const view = store.eventView(event);
  const count = await store.countConfirmedRegistrations(event.eventId);
  return { ...view, confirmedRegistrationCount: count, placesRemaining: placesRemaining(event, count) };
}

async function managementContext(eventId) {
  const context = await eventClient.planningContext(eventId);
  if (!context) return null;
  return context;
}

async function authorizeRegistrationManagement(req, event) {
  const context = await managementContext(event.eventId);
  if (!context) return false;
  const organiser = hasRole(req.actor, 'EVENT_ORGANISER') && context.organiserId === req.actor.id;
  const coordinator = hasRole(req.actor, 'EVENT_COORDINATOR') && context.currentCoordinatorId === req.actor.id;
  return { allowed: organiser || coordinator, coordinator, context };
}

router.get('/events', async (_req, res, next) => {
  try {
    const events = await projection.list();
    return res.json({ events: await Promise.all(events.map(publicEventView)) });
  }
  catch (error) { return next(error); }
});

router.get('/events/:id', async (req, res, next) => {
  try {
    const event = await projection.find(req.params.id);
    if (!event) return sendError(res, 404, 'NOT_FOUND', 'Event not found.');
    if (!isEventVisible(event.status)) return sendError(res, 404, 'NOT_FOUND', 'Event not found.');
    return res.json(filterAttendeeFields(await publicEventView(event)));
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

router.post('/events/:id/registrations', async (req, res, next) => {
  try {
    if (!hasRole(req.actor, 'ATTENDEE')) return sendError(res, 403, 'FORBIDDEN', 'Only Attendees can register for an Event.');
    const current = await projection.find(req.params.id);
    if (!current) {
      const local = await store.findEvent(req.params.id);
      if (local) return sendError(res, 409, 'EVENT_NOT_CONFIRMED', 'This Event is not currently confirmed and cannot accept registrations.');
      return sendError(res, 404, 'NOT_FOUND', 'Event not found.');
    }
    const result = await store.createRegistration(req.params.id, req.actor.id, new Date());
    return res.status(201).json(result);
  }
  catch (error) {
    if (error.status) return sendError(res, error.status, error.code, error.message);
    return next(error);
  }
});

router.get('/registrations', async (req, res, next) => {
  try {
    if (!hasRole(req.actor, 'ATTENDEE')) return sendError(res, 403, 'FORBIDDEN', 'Only Attendees can view their registrations.');
    const registrations = await store.registrationsForUser(req.actor.id);
    return res.json({ registrations: registrations.map(row => ({
      id: row.id, eventId: row.eventId, userId: row.userId, status: row.status,
      registeredAt: row.registeredAt, event: row.event ? store.eventView(row.event) : undefined,
    })) });
  }
  catch (error) { return next(error); }
});

router.get('/events/:id/registrations', async (req, res, next) => {
  try {
    const event = await store.findEvent(req.params.id);
    if (!event) return sendError(res, 404, 'NOT_FOUND', 'Event not found.');
    const access = await authorizeRegistrationManagement(req, event);
    if (!access?.allowed) return sendError(res, 403, 'FORBIDDEN', 'Only this Event’s Organiser and current Coordinator may view registrations.');
    const registrations = await store.registrationsForEvent(event.eventId);
    const count = registrations.filter(row => row.status === 'CONFIRMED').length;
    return res.json({ registrations, confirmedRegistrationCount: count, registrationLimit: event.registrationLimit,
      placesRemaining: placesRemaining(event, count), overCapacity: event.registrationLimit != null && count > event.registrationLimit });
  }
  catch (error) { if (error.status) return sendError(res, error.status, error.code, error.message); return next(error); }
});

router.put('/events/:id/registration-limit', async (req, res, next) => {
  try {
    const event = await store.findEvent(req.params.id);
    if (!event) return sendError(res, 404, 'NOT_FOUND', 'Event not found.');
    const access = await authorizeRegistrationManagement(req, event);
    if (!access?.coordinator) return sendError(res, 403, 'FORBIDDEN', 'Only this Event’s current Coordinator may set its registration limit.');
    const limit = req.body?.registrationLimit;
    if (!Number.isSafeInteger(limit) || limit < 1) return sendError(res, 422, 'VALIDATION_FAILED', 'Registration limit must be a positive whole number.');
    const updated = await store.setRegistrationLimit(event.eventId, limit);
    const count = await store.countConfirmedRegistrations(event.eventId);
    return res.json({ registrationLimit: updated.registrationLimit, confirmedRegistrationCount: count,
      placesRemaining: placesRemaining(updated, count), overCapacity: count > limit });
  }
  catch (error) { if (error.status) return sendError(res, error.status, error.code, error.message); return next(error); }
});

module.exports = router;
