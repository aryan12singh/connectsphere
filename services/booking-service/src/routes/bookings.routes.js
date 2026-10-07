// Venue booking routes (Kong: /venue-bookings). Business rules: see policy.js.
const express = require('express');
const { requireAuth, requireAnyPermission } = require('../auth');
const store = require('../store');
const venueClient = require('../venueClient');
const {
  text, validateBooking, validateStatusChange, validateQuery, isValidIdempotencyKey, isUuid, toIsoInstant,
} = require('../validation');
const {
  DECIDER_STATUSES, CREATE_STATUS, canDecide, canEditDetails, canViewFull, availabilityView,
} = require('../policy');
const { filterAvailability } = require('../availability');

const router = express.Router();
const auth = requireAuth();
// Reading needs either booking permission; what is returned depends on which.
const bookingAccess = requireAnyPermission('venue_bookings.create', 'venue_bookings.decide');
const createPermission = requireAnyPermission('venue_bookings.create');

function createPermission(req, res, next) {
  // Venue staff may block a maintenance/unavailable window under CS-35.
  // Decision permission does not grant creation of an ordinary event booking.
  const operationalBlock = hasPermission(req.actor, 'venue_bookings.decide')
    && ['BLOCKED', 'UNAVAILABLE'].includes(req.body?.status);
  return (operationalBlock ? operationalBlockPermission : ordinaryCreatePermission)(req, res, next);
}

async function assignmentAccess(req, res, eventId) {
  if (isStaff(req.actor)) return true;
  try {
    if (await canBookEvent(req, eventId)) return true;
    res.status(403).json({ error: 'Event is not assigned to you' });
  } catch {
    res.status(503).json({ error: 'Unable to check event assignment. Please retry.' });
  }
  return false;
}

// Only current assigned work survives filtering; history uses the same IDs.
async function visibleBookings(req, res) {
  const bookings = await store.listBookings();
  if (isStaff(req.actor)) return bookings;
  const allowed = [], checked = new Map();
  try {
    for (const booking of bookings.filter(b => b.requestedById === req.actor.id)) {
      if (!checked.has(booking.eventId)) checked.set(booking.eventId, await canBookEvent(req, booking.eventId));
      if (checked.get(booking.eventId)) allowed.push(booking);
    }
  } catch {
    res.status(503).json({ error: 'Unable to check event assignment. Please retry.' });
    return null;
  }
  return allowed;
}

function validationError(res, fields) {
  return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Request contains invalid fields', fields } });
}

function conflictError(res) {
  return res.status(409).json({ error: { code: 'BOOKING_CONFLICT', message: 'The venue is not available for the selected time' } });
}

function forbidden(res, message, code = 'FORBIDDEN') {
  return res.status(403).json({ error: { code, message } });
}

// Turns a checked request body into the fields the store saves.
function bookingInput(body, status) {
  return {
    eventId: text(body.eventId) || null,
    venueId: body.venueId,
    title: text(body.title),
    reason: text(body.reason),
    startAt: toIsoInstant(body.startAt),
    endAt: toIsoInstant(body.endAt),
    timeZone: body.timeZone,
    status,
  };
}

// Returns null when the venue can take bookings, otherwise a 422/503 reply.
async function venueProblem(res, venueId) {
  let venue;
  try {
    venue = await venueClient.getVenue(venueId);
  } catch (error) {
    console.error(error);
    return res.status(503).json({ error: { code: 'VENUE_SERVICE_UNAVAILABLE', message: 'Unable to check the venue right now' } });
  }
  if (!venue) return validationError(res, { venueId: ['Venue not found'] });
  if (venue.isActive === false) return validationError(res, { venueId: ['This venue is not accepting bookings'] });
  return null;
}

// Runs a store write and turns a booking conflict into a 409.
async function saveOrConflict(res, write) {
  try {
    return await write();
  } catch (error) {
    if (error instanceof store.BookingConflictError) {
      conflictError(res);
      return undefined;
    }
    throw error;
  }
}

// List: Venue Staff see every booking; coordinators see only their own.
router.get('/', auth, bookingAccess, async (req, res) => {
  const errors = validateQuery(req.query);
  if (Object.keys(errors).length) return validationError(res, errors);
  const statuses = req.query.status ? req.query.status.split(',') : null;
  const values = (await store.listBookings()).filter((booking) => {
    if (!canViewFull(booking, req.actor)) return false;
    if (req.query.venueId && booking.venueId !== req.query.venueId) return false;
    if (req.query.eventId && booking.eventId !== req.query.eventId) return false;
    if (statuses && !statuses.includes(booking.status)) return false;
    return true;
  });
  return res.json({ items: values, total: values.length });
});

// History of a venue's bookings: Venue Staff see all; coordinators only the
// entries for their own bookings.
router.get('/history', auth, bookingAccess, async (req, res) => {
  if (!req.query.venueId) return validationError(res, { venueId: ['Venue is required'] });
  const errors = validateQuery({ venueId: req.query.venueId });
  if (Object.keys(errors).length) return validationError(res, errors);
  const items = (await store.listHistory(req.query.venueId))
    .filter((entry) => canDecide(req.actor) || entry.requestedById === req.actor.id)
    .map(({ requestedById, ...entry }) => entry);
  return res.json({ venueId: req.query.venueId, items });
});

// Calendar data. Other people's bookings come back as "Not available" slots
// with times only (policy.availabilityView).
router.get('/availability', auth, bookingAccess, async (req, res) => {
  const errors = validateQuery(req.query);
  if (Object.keys(errors).length) return validationError(res, errors);
  const inVenue = (await store.listBookings()).filter((booking) => !req.query.venueId || booking.venueId === req.query.venueId);
  const items = filterAvailability(inVenue, req.query)
    .map((booking) => availabilityView(booking, req.actor))
    .filter(Boolean);
  return res.json({ items });
});

// Create: Event Coordinators only. Always starts TENTATIVELY_HELD.
router.post('/', auth, createPermission, async (req, res) => {
  const key = req.get('idempotency-key');
  const body = req.body || {};
  const errors = validateBooking(body);
  if (!text(body.eventId)) errors.eventId = ['Event is required'];
  if (!isValidIdempotencyKey(key)) errors.idempotencyKey = ['Idempotency-Key header is required (8–100 letters, digits, . _ : -)'];
  if (Object.keys(errors).length) return validationError(res, errors);
  if (body.status !== undefined && body.status !== CREATE_STATUS) {
    return forbidden(res, 'New bookings are always tentatively held. Venue staff set the status.', 'STATUS_NOT_PERMITTED');
  }

  const input = bookingInput(body, CREATE_STATUS);
  const existing = await store.findIdempotency(req.actor.id, key);
  if (existing) {
    if (existing.fingerprint !== store.fingerprint(input)) {
      return res.status(409).json({ error: { code: 'IDEMPOTENCY_KEY_REUSE', message: 'Idempotency key was reused with a different booking' } });
    }
    return res.status(200).json(await store.getBooking(existing.bookingId));
  }

  const problem = await venueProblem(res, input.venueId);
  if (problem) return problem;
  let created;
  try {
    created = await saveOrConflict(res, () => store.createBooking(input, req.actor, key));
  } catch (error) {
    // Two identical requests arrived together: the database's unique
    // (requestedById, idempotencyKey) index let only one in. Answer the
    // other like a normal retry.
    if (error.code !== 'P2002') throw error;
    const winner = await store.findIdempotency(req.actor.id, key);
    if (!winner || winner.fingerprint !== store.fingerprint(input)) {
      return res.status(409).json({ error: { code: 'IDEMPOTENCY_KEY_REUSE', message: 'Idempotency key was reused with a different booking' } });
    }
    return res.status(200).json(await store.getBooking(winner.bookingId));
  }
  if (created === undefined) return undefined;
  return res.status(201).json(created);
});

router.get('/:id', auth, bookingAccess, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Booking not found' });
  const booking = await store.getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (!canViewFull(booking, req.actor)) return forbidden(res, 'You do not have access to this booking');
  return res.json(booking);
});

// Change a booking.
//  * Venue Staff: change the status only, with a reason. Other fields stay.
//  * The coordinator who made it: edit details while TENTATIVELY_HELD, but
//    never the status.
router.put('/:id', auth, bookingAccess, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Booking not found' });
  const booking = await store.getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  const body = req.body || {};

  if (canDecide(req.actor)) {
    const errors = validateStatusChange(body);
    if (Object.keys(errors).length) return validationError(res, errors);
    if (!DECIDER_STATUSES.includes(body.status)) {
      return forbidden(res, `Venue staff can set: ${DECIDER_STATUSES.join(', ')}`, 'STATUS_NOT_PERMITTED');
    }
    if (body.status === booking.status) return validationError(res, { status: ['Choose a different status'] });
    const input = { ...booking, status: body.status };
    const saved = await saveOrConflict(res, () => store.replaceBooking(booking, input, req.actor, text(body.reason)));
    if (saved === undefined) return undefined;
    return res.json(saved);
  }

  if (!canEditDetails(booking, req.actor)) {
    if (!canViewFull(booking, req.actor)) return forbidden(res, 'You do not have access to this booking');
    return forbidden(res, 'Only a tentatively held booking can be changed by its coordinator');
  }
  const errors = validateBooking(body);
  if (Object.keys(errors).length) return validationError(res, errors);
  if (body.status !== undefined && body.status !== booking.status) {
    return forbidden(res, "Only venue staff can change a booking's status", 'STATUS_NOT_PERMITTED');
  }
  const input = bookingInput(body, booking.status);
  if (!input.eventId) input.eventId = booking.eventId;
  if (input.venueId !== booking.venueId) {
    const problem = await venueProblem(res, input.venueId);
    if (problem) return problem;
  }
  const saved = await saveOrConflict(res, () => store.replaceBooking(booking, input, req.actor));
  if (saved === undefined) return undefined;
  return res.json(saved);
});

module.exports = router;
