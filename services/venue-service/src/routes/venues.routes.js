const express = require('express');
const { requireAuth, requireAnyPermission, internalOnly } = require('../auth');
const store = require('../store');
const bookingClient = require('../bookingClient');
const config = require('../config');
const { VENUE_TYPES, LAYOUTS, text, validateVenue, normaliseVenue, validateHours,validateLegacyBuffers } = require('../validation');

const router = express.Router();
const auth = requireAuth();
const view = requireAnyPermission('venues.view');
const manage = requireAnyPermission('venues.manage');

function validationError(res, fields) {
  return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Request contains invalid fields', fields } });
}

router.get('/options', auth, view, (req, res) => res.json({
  maxBufferMinutes:config.maxBufferMinutes,
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
router.get('/internal/catalogue',internalOnly,async(req,res)=>res.json({items:await store.listVenues()}));

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

router.get('/:id/legacy-buffer-context',auth,manage,async(req,res)=>res.json(await bookingClient.legacyBuffers(req.params.id)));
router.get('/:id/buffer-status',auth,manage,async(req,res)=>{
  const venue=await store.getVenue(req.params.id);
  if(!venue)return res.status(404).json({error:'Venue not found'});
  let canEdit=!venue.buffersLockedAt;
  if(!canEdit && !venue.legacyBufferConfigurationPending){
    if(store.recoverableFence(venue,await store.listHistory(venue.id))){
      const checked=await bookingClient.legacyBuffers(venue.id,undefined,'buffer-status');
      if(checked.venueId!==venue.id || checked.version!==venue.version || typeof checked.everConfirmed!=='boolean')return res.status(409).json({error:{code:'STALE_VENUE',message:'Venue changed. Reload before editing'}});
      canEdit=!checked.everConfirmed;
    }
  }
  return res.json({venueId:venue.id,version:venue.version,canEdit});
});
router.put('/:id/legacy-buffers',auth,manage,async(req,res)=>{
  const errors=validateLegacyBuffers(req.body);
  if(Object.keys(errors).length)return validationError(res,errors);
  return res.json(await bookingClient.legacyBuffers(req.params.id,{version:req.body.version,setupMinutes:req.body.setupMinutes,turnaroundMinutes:req.body.turnaroundMinutes,reason:text(req.body.reason),communications:req.body.communications,actor:{id:req.actor.id,role:req.actor.role}}));
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
  if (req.body?.version!==undefined && (!Number.isSafeInteger(req.body.version)||req.body.version<1)) return validationError(res,{version:['Use the current venue version']});
  return res.json({ venueId: venue.id, timeZone: venue.timeZone, items: await store.setOperatingHours(venue.id, hours, req.actor, req.body?.reason || 'Operating hours updated',req.body?.version) });
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
  if (req.body.version!==undefined && (!Number.isSafeInteger(req.body.version)||req.body.version<1)) return validationError(res,{version:['Use the current venue version']});
  const input = {...normaliseVenue(req.body),version:req.body.version,
    setupMinutes:req.body.setupMinutes,turnaroundMinutes:req.body.turnaroundMinutes};
  if(venue.buffersLockedAt && !venue.legacyBufferConfigurationPending && ((input.setupMinutes ?? venue.setupMinutes)!==venue.setupMinutes || (input.turnaroundMinutes ?? venue.turnaroundMinutes)!==venue.turnaroundMinutes)){
    if(!Number.isSafeInteger(input.version)||input.version<1)return validationError(res,{version:['Current venue version is required']});
    return res.json(await bookingClient.legacyBuffers(venue.id,{input,actor:{id:req.actor.id,role:req.actor.role}},'buffer-fence-recovery'));
  }
  return res.json(await store.replaceVenue(venue.id, input, req.actor));
});

router.delete('/:id', auth, manage, async (req, res) => {
  const venue = await store.getVenue(req.params.id);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });
  let result;
  try {
    result = await bookingClient.removeUnusedVenue(venue.id,req.actor);
  } catch (error) {
    if(error.status===409 && error.code==='STALE_VENUE')return res.status(409).json({error:{code:'STALE_VENUE',message:'Venue settings changed during deletion. Refresh and retry.'}});
    console.error(error);
    return res.status(503).json({ error: { code: 'BOOKING_SERVICE_UNAVAILABLE', message: 'Unable to verify linked bookings' } });
  }
  if (result.blockingCount > 0) {
    return res.status(409).json({
      error: {
        code: 'VENUE_HAS_BLOCKING_BOOKINGS',
        message: 'Venue has current or future tentative or confirmed bookings',
        fields: { venueId: ['Venue cannot be deleted while blocking bookings exist'] },
      },
      venueId: venue.id,
      blockingCount:result.blockingCount,
    });
  }
  return result.deleted ? res.status(204).end() : res.status(404).json({ error: 'Venue not found' });
});

router.get('/:id/internal', internalOnly, async (req, res) => {
  const venue = await store.getVenue(req.params.id);
  return venue ? res.json(venue) : res.status(404).json({ error: 'Venue not found' });
});

module.exports = router;
