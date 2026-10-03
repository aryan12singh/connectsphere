const express = require('express');
const { requireAuth, requirePermission } = require('../auth');
const store = require('../store');
const { STATUSES, validateBooking, text } = require('../validation');
const { isStaff, statusForCreate, canCreateStatus, canReplace } = require('../policy');

const router = express.Router();
const auth = requireAuth();
const createPermission = requirePermission('venue_bookings.create');

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

router.get('/', auth, async (req, res) => {
  const values = (await store.listBookings()).filter((booking) => {
    if (!isStaff(req.actor) && booking.requestedById !== req.actor.id) return false;
    if (req.query.venueId && booking.venueId !== req.query.venueId) return false;
    if (req.query.eventId && booking.eventId !== req.query.eventId) return false;
    if (req.query.status && !String(req.query.status).split(',').includes(booking.status)) return false;
    return true;
  });
  return res.json({ items: values, total: values.length });
});

router.get('/history', auth, async (req, res) => {
  if (!req.query.venueId) return validationError(res, { venueId: ['Venue is required'] });
  return res.json({ venueId: req.query.venueId, items: await store.listHistory(req.query.venueId) });
});

router.get('/availability', auth, async (req, res) => {
  const values = (await store.listBookings()).filter((booking) => !req.query.venueId || booking.venueId === req.query.venueId);
  return res.json({ items: values, conflictDetection: 'client-only' });
});

router.post('/', auth, createPermission, async (req, res) => {
  const key = req.get('idempotency-key');
  const body = req.body || {};
  const errors = validateBooking(body);
  if (req.actor.role === 'EVENT_COORDINATOR' && !text(body.eventId)) errors.eventId = ['Event is required for coordinator bookings'];
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
  const input = normalise(body, req.actor, true);
  const existing = await store.findIdempotency(req.actor.id, key);
  if (existing) {
    if (existing.fingerprint !== store.fingerprint(input)) return res.status(409).json({ error: { code: 'IDEMPOTENCY_KEY_REUSE', message: 'Idempotency key was reused with a different booking' } });
    return res.status(200).json(await store.getBooking(existing.bookingId));
  }
  return res.status(201).json(await store.createBooking(input, req.actor, key));
});

router.get('/:id', auth, async (req, res) => {
  const booking = await store.getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (!isStaff(req.actor) && booking.requestedById !== req.actor.id) return res.status(403).json({ error: 'You do not have access to this booking' });
  return res.json(booking);
});

router.put('/:id', auth, async (req, res) => {
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
  return res.json(await store.replaceBooking(booking, normalise(body, req.actor), req.actor));
});

module.exports = router;
