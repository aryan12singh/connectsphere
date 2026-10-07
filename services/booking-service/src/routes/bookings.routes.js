const express = require('express');
const { requireAuth, requireAnyPermission } = require('../auth');
const store = require('../store');
const { STATUSES, validateBooking, text } = require('../validation');
const { isStaff, statusForCreate, canCreateStatus, canReplace } = require('../policy');
const { availabilityRange, filterAvailability } = require('../availability');
const { canBookEvent } = require('../eventClient');
const { hasPermission } = require('../../../utils/role-policy');

const router = express.Router();
const auth = requireAuth();
const ordinaryCreatePermission = requireAnyPermission('venue_bookings.create');
const operationalBlockPermission = requireAnyPermission('venue_bookings.decide');
const bookingAccess = requireAnyPermission('venue_bookings.create', 'venue_bookings.decide');

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

function normalise(body, actor, forceTentative = false) {
  return {
    eventId: text(body.eventId) || null,
    venueId: text(body.venueId),
    title: text(body.title),
    reason: text(body.reason),
    startAt: body.startAt,
    endAt: body.endAt,
    timeZone: text(body.timeZone) || 'Asia/Singapore',
    status: forceTentative ? statusForCreate(actor, body.status) : (body.status || 'TENTATIVELY_HELD'),
  };
}

router.get('/', auth, bookingAccess, async (req, res) => {
  const visible = await visibleBookings(req, res);
  if (!visible) return;
  const values = visible.filter((booking) => {
    if (!isStaff(req.actor) && booking.requestedById !== req.actor.id) return false;
    if (req.query.venueId && booking.venueId !== req.query.venueId) return false;
    if (req.query.eventId && booking.eventId !== req.query.eventId) return false;
    if (req.query.status && !String(req.query.status).split(',').includes(booking.status)) return false;
    return true;
  });
  return res.json({ items: values, total: values.length });
});

router.get('/history', auth, bookingAccess, async (req, res) => {
  if (!req.query.venueId) return validationError(res, { venueId: ['Venue is required'] });
  const visible = await visibleBookings(req, res);
  if (!visible) return;
  const ids = new Set(visible.map(b => b.id));
  const items = (await store.listHistory(req.query.venueId)).filter(entry => ids.has(entry.bookingId));
  return res.json({ venueId: req.query.venueId, items });
});

router.get('/availability', auth, requireAnyPermission('venues.view'), async (req, res) => {
  const errors = availabilityRange(req.query);
  if (Object.keys(errors).length) return validationError(res, errors);
  const values = filterAvailability(
    (await store.listBookings()).filter((booking) => !req.query.venueId || booking.venueId === req.query.venueId),
    req.query,
  );
  return res.json({ items: values, conflictDetection: 'client-only' });
});

router.post('/', auth, createPermission, async (req, res) => {
  const key = req.get('idempotency-key');
  const body = req.body || {};
  const errors = validateBooking(body);
  if (!hasPermission(req.actor, 'venue_bookings.decide') && !text(body.eventId)) errors.eventId = ['Event is required for coordinator bookings'];
  if (!key) errors.idempotencyKey = ['Idempotency-Key header is required'];
  if (Object.keys(errors).length) return validationError(res, errors);
  const requestedStatus = statusForCreate(req.actor, body.status);
  if (!canCreateStatus(req.actor, requestedStatus)) {
    return res.status(403).json({
      error: {
        code: 'STATUS_NOT_PERMITTED',
        message: 'The requested booking status is not permitted for this actor',
        fields: { status: ['Status is not permitted for this actor'] },
      },
    });
  }
  if (!await assignmentAccess(req, res, body.eventId)) return;
  const input = normalise(body, req.actor, true);
  const existing = await store.findIdempotency(req.actor.id, key);
  if (existing) {
    if (existing.fingerprint !== store.fingerprint(input)) return res.status(409).json({ error: { code: 'IDEMPOTENCY_KEY_REUSE', message: 'Idempotency key was reused with a different booking' } });
    return res.status(200).json(await store.getBooking(existing.bookingId));
  }
  return res.status(201).json(await store.createBooking(input, req.actor, key));
});

router.get('/:id', auth, bookingAccess, async (req, res) => {
  const booking = await store.getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (!isStaff(req.actor) && booking.requestedById !== req.actor.id) return res.status(403).json({ error: 'You do not have access to this booking' });
  if (!await assignmentAccess(req, res, booking.eventId)) return;
  return res.json(booking);
});

router.put('/:id', auth, bookingAccess, async (req, res) => {
  const booking = await store.getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  const body = req.body || {};
  const errors = validateBooking(body);
  if (Object.keys(errors).length) return validationError(res, errors);
  const nextStatus = body.status;
  const decision = canReplace(booking, req.actor, nextStatus);
  if (!decision.allowed) {
    if (booking.requestedById !== req.actor.id) return res.status(403).json({ error: 'You do not own this booking' });
    return res.status(403).json({ error: decision.message });
  }
  if (!isStaff(req.actor) && (!await assignmentAccess(req, res, booking.eventId) || !await assignmentAccess(req, res, body.eventId))) return;
  return res.json(await store.replaceBooking(booking, normalise(body, req.actor), req.actor));
});

module.exports = router;
