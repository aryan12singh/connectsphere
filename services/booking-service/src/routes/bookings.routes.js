const express = require('express');
const { requireAuth, requireAnyPermission } = require('../auth');
const store = require('../store');
const { STATUSES, validateBooking, text } = require('../validation');
const { isStaff, statusForCreate, canCreateStatus } = require('../policy');
const { availabilityRange } = require('../availability');
const { canBookEvent } = require('../eventClient');
const { hasPermission } = require('../../../utils/role-policy');
const workflows = require('../workflows');

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
    for (const booking of bookings.filter(b => b.eventId)) {
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
    startAt: new Date(body.startAt).toISOString(),
    endAt: new Date(body.endAt).toISOString(),
    timeZone: text(body.timeZone) || 'Asia/Singapore',
    status: forceTentative ? statusForCreate(actor, body.status) : (body.status || 'TENTATIVELY_HELD'),
    ...Object.fromEntries(['expiresAt','expectedAttendance','layout','facilities','accessibilityNeeds','required'].filter(key=>body[key]!==undefined).map(key=>[key,body[key]])),
  };
}

router.get('/', auth, bookingAccess, async (req, res) => {
  const visible = await visibleBookings(req, res);
  if (!visible) return;
  const matchesQuery = (booking) => {
    if (req.query.venueId && booking.venueId !== req.query.venueId) return false;
    if (req.query.eventId && booking.eventId !== req.query.eventId) return false;
    if (req.query.status && !String(req.query.status).split(',').includes(booking.status)) return false;
    return true;
  };
  let values = visible.filter(matchesQuery);
  if (isStaff(req.actor) && String(req.query.status || '').split(',').includes('TENTATIVELY_HELD')) {
    values=values.filter(row=>row.status!=='TENTATIVELY_HELD' || workflows.effective(row,require('../clock').now()));
    const summaries=new Map();
    for(const booking of values) if(!summaries.has(booking.eventId)) summaries.set(booking.eventId,await workflows.summary(req,booking.eventId,{allowMissingEvent:true}));
    values=values.map(row=>summaries.get(row.eventId)?.items.find(item=>item.id===row.id) || row);
    const checkedAt=require('../clock').now();
    values=values.filter(row=>matchesQuery(row) && (row.status!=='TENTATIVELY_HELD' || row.effectiveStatus!=='EXPIRED' && workflows.effective(row,checkedAt)));
  }
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
  return res.json(await workflows.availability(req,req.query));
});
router.put('/events/:eventId/primary-venue',auth,ordinaryCreatePermission,async(req,res)=>res.json(await workflows.selectPrimaryVenue(req,req.params.eventId,req.body || {})));
router.get('/events/:eventId/summary',auth,bookingAccess,async(req,res)=>res.json(await workflows.summary(req,req.params.eventId)));
router.get('/events/:eventId/venue-search',auth,ordinaryCreatePermission,async(req,res)=>res.json(await workflows.search(req,req.params.eventId,req.query)));
router.get('/conflicts',auth,operationalBlockPermission,async(req,res)=>{
  if(req.query.venueId!==undefined && !text(req.query.venueId)) return validationError(res,{venueId:['Use a venue ID']});
  return res.json(await workflows.conflictReport(req,req.query));
});
router.post('/rechecks',auth,operationalBlockPermission,async(req,res)=>{
  const body=req.body || {},errors={};
  if(!text(body.venueId)) errors.venueId=['Venue is required'];
  if(!Number.isSafeInteger(body.version) || body.version<1) errors.version=['Refresh to use the current venue version'];
  if(!text(body.reason)) errors.reason=['Recheck reason is required'];
  if(Object.keys(errors).length) return validationError(res,errors);
  return res.json(await workflows.staffRecheck(req,body));
});

router.post('/', auth, createPermission, async (req, res) => {
  const key = req.get('idempotency-key');
  const body = req.body || {};
  const errors = validateBooking(body);
  if(body.expiresAt===null && (!body.status || body.status==='TENTATIVELY_HELD'))errors.expiresAt=['Omit the deadline to use the default; a supplied deadline must be valid'];
  for(const field of ['setupMinutes','turnaroundMinutes']) if (body[field]!==undefined) errors[field]=['Buffers are configured on the venue, not per booking'];
  if (!hasPermission(req.actor, 'venue_bookings.decide') && !text(body.eventId)) errors.eventId = ['Event is required for coordinator bookings'];
  if (!key) errors.idempotencyKey = ['Idempotency-Key header is required'];
  if (Object.keys(errors).length) return validationError(res, errors);
  const requestedStatus = statusForCreate(req.actor, body.status);
  if (!canCreateStatus(req.actor, requestedStatus) || !['TENTATIVELY_HELD','CANCELLED','BLOCKED','UNAVAILABLE'].includes(requestedStatus)) {
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
  const result = await workflows.create(req,input,key);
  return res.status(result.status).json(result.booking);
});

router.put('/:id/decision',auth,operationalBlockPermission,async(req,res)=>{
  const body=req.body || {},errors={};
  if (!['CONFIRMED','REJECTED'].includes(body.status)) errors.status=['Choose approval or rejection'];
  if (!text(body.reason)) errors.reason=['Decision reason is required'];
  if (Object.keys(errors).length) return validationError(res,errors);
  return res.json(await workflows.decision(req,req.params.id,body));
});
router.post('/:id/hold-extension/request',auth,async(req,res)=>{
  if (!text(req.body?.reason)) return validationError(res,{reason:['Extension request reason is required']});
  return res.json(await workflows.requestExtension(req,req.params.id,req.body));
});
router.put('/:id/hold-extension',auth,operationalBlockPermission,async(req,res)=>{
  if (!text(req.body?.reason)) return validationError(res,{reason:['Extension reason is required']});
  return res.json(await workflows.extend(req,req.params.id,req.body));
});

router.get('/:id', auth, bookingAccess, async (req, res) => {
  const booking = await store.getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (!await assignmentAccess(req, res, booking.eventId)) return;
  return res.json(booking);
});

router.delete('/:id',auth,bookingAccess,async(req,res)=>{
  const booking=await store.getBooking(req.params.id);
  if(!booking) return res.status(404).json({error:'Booking not found'});
  if(!await assignmentAccess(req,res,booking.eventId)) return;
  return res.set('Allow','GET, PUT').status(405).json({error:{code:'METHOD_NOT_ALLOWED',message:'Bookings and their history are retained. Use the authorized arrangement-change workflow.'}});
});

router.put('/:id', auth, bookingAccess, async (req, res) => {
  const booking = await store.getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  const body = req.body || {};
  const errors = validateBooking(body);
  if (Object.keys(errors).length) return validationError(res, errors);
  if (!await assignmentAccess(req,res,booking.eventId)) return;
  return res.json(await workflows.replace(req,booking.id,normalise(body,req.actor),body));
});

module.exports = router;
