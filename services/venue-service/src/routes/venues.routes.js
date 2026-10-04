const express = require('express');
const { requireAuth, requireAnyPermission, internalOnly } = require('../auth');
const store = require('../store');
const bookingClient = require('../bookingClient');
const { VENUE_TYPES, LAYOUTS, text, validateVenue, normaliseVenue, validateHours } = require('../validation');

const router = express.Router();
const auth = requireAuth();
const view = requireAnyPermission('venues.view');
const manage = requireAnyPermission('venues.manage');

function validationError(res, fields) {
  return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Request contains invalid fields', fields } });
}

router.get('/options', auth, view, (req, res) => res.json({
  venueTypes: VENUE_TYPES.map((value) => ({ value, label: value[0] + value.slice(1).toLowerCase() })),
  supportedLayouts: LAYOUTS.map((value) => ({ value, label: value[0] + value.slice(1).toLowerCase() })),
  facilities: [
    ['PROJECTOR', 'Projector'], ['PA_SYSTEM', 'PA system'], ['STAGE', 'Stage'],
    ['WIFI', 'Wi-Fi'], ['LIVESTREAM_BOOTH', 'Livestream booth'],
  ].map(([value, label]) => ({ value, label })),
  accessibilityTags: [
    ['WHEELCHAIR_ACCESS', 'Wheelchair accessible entrance & seating'],
    ['HEARING_LOOP', 'Hearing loop / assisted listening'],
    ['ACCESSIBLE_RESTROOMS', 'Accessible restrooms nearby'],
  ].map(([value, label]) => ({ value, label })),
}));

router.get('/', auth, view, async (req, res) => {
  const search = String(req.query.search || '').toLowerCase();
  const venues = (await store.listVenues()).filter((venue) => !search || `${venue.name} ${venue.address}`.toLowerCase().includes(search));
  res.json({ items: venues, total: venues.length });
});

router.post('/', auth, manage, async (req, res) => {
  const errors = validateVenue(req.body || {});
  if (Object.keys(errors).length) return validationError(res, errors);
  const venue = await store.createVenue(normaliseVenue(req.body), req.actor);
  return res.status(201).json(venue);
});

router.get('/:id/history', auth, view, async (req, res) => res.json({ venueId: req.params.id, items: await store.listHistory(req.params.id) }));

router.get('/:id/operating-hours', auth, view, async (req, res) => {
  const venue = await store.getVenue(req.params.id);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });
  return res.json({ venueId: venue.id, timeZone: venue.timeZone, items: venue.operatingHours });
});

router.put('/:id/operating-hours', auth, manage, async (req, res) => {
  const venue = await store.getVenue(req.params.id);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });
  const errors = validateHours(req.body?.items ?? req.body);
  if (Object.keys(errors).length) return validationError(res, errors);
  const hours = req.body?.items ?? req.body;
  if (!text(req.body?.reason)) return validationError(res, { reason: ['Reason is required'] });
  return res.json({ venueId: venue.id, timeZone: venue.timeZone, items: await store.setOperatingHours(venue.id, hours, req.actor, req.body?.reason || 'Operating hours updated') });
});

router.get('/:id', auth, view, async (req, res) => {
  const venue = await store.getVenue(req.params.id);
  return venue ? res.json(venue) : res.status(404).json({ error: 'Venue not found' });
});

router.put('/:id', auth, manage, async (req, res) => {
  const venue = await store.getVenue(req.params.id);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });
  const errors = validateVenue(req.body || {});
  if (Object.keys(errors).length) return validationError(res, errors);
  return res.json(await store.replaceVenue(venue.id, normaliseVenue(req.body), req.actor));
});

router.delete('/:id', auth, manage, async (req, res) => {
  const venue = await store.getVenue(req.params.id);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });
  let blockingCount;
  try {
    blockingCount = await bookingClient.blockingBookingCount(venue.id);
  } catch (error) {
    console.error(error);
    return res.status(503).json({ error: { code: 'BOOKING_SERVICE_UNAVAILABLE', message: 'Unable to verify linked bookings' } });
  }
  if (blockingCount > 0) {
    return res.status(409).json({
      error: {
        code: 'VENUE_HAS_BLOCKING_BOOKINGS',
        message: 'Venue has current or future tentative or confirmed bookings',
        fields: { venueId: ['Venue cannot be deleted while blocking bookings exist'] },
      },
      venueId: venue.id,
      blockingCount,
    });
  }
  const deleted = await store.deleteVenue(venue.id);
  return deleted ? res.status(204).end() : res.status(404).json({ error: 'Venue not found' });
});

router.get('/:id/internal', internalOnly, async (req, res) => {
  const venue = await store.getVenue(req.params.id);
  return venue ? res.json(venue) : res.status(404).json({ error: 'Venue not found' });
});

module.exports = router;
