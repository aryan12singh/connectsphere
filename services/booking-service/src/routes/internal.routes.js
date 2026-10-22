const express = require('express');
const { internalOnly } = require('../auth');
const store = require('../store');
const workflows = require('../workflows');
const {venueContext,removeVenue}=require('../venueClient');

const router = express.Router();
router.post('/events/:id/cancellation-release',internalOnly,async(req,res)=>res.json(await require('../cancellationRelease').release(req.params.id,req.body)));
router.get('/events/:id/public-venues',internalOnly,async(req,res)=>{
 const context=await require('../eventClient').planningContext(req.params.id);
 if(!['CONFIRMED','PREPARATION'].includes(context.status)||context.safetyState!=='APPROVED')return res.status(409).json({error:{code:'CURRENT_SAFETY_REQUIRED',message:'The effective Event is awaiting current Safety and reconfirmation'}});
 const summary=await workflows.summary({actor:{id:context.currentCoordinatorId,role:'EVENT_COORDINATOR',permissions:['venue_bookings.create']}},req.params.id);
 if(!summary.venueReady)return res.status(409).json({error:{code:'VENUES_NOT_READY',message:'The effective venue arrangement is not ready'}});
 const venues=summary.items.filter(row=>row.status==='CONFIRMED'&&!row.flags.length).map(row=>({id:row.venueId,bookingId:row.id,name:row.venueName,startAt:row.startAt,endAt:row.endAt}));
 const primary=venues.find(row=>row.bookingId===summary.primaryVenue.bookingId)||venues[0]||null;
 res.json({eventId:req.params.id,venues,primaryVenueId:primary?.id||null,primaryVenueName:primary?.name||null});
});
router.get('/events/:id/readiness',internalOnly,async(req,res)=>res.json(await require('../readiness').preview(req.params.id)));
router.get('/events/:id/equipment-allocation-context',internalOnly,async(req,res)=>res.json(await workflows.equipmentAllocationContext(req.params.id)));
router.post('/events/:id/readiness/prepare',internalOnly,async(req,res)=>res.json(await require('../readiness').prepare(req.params.id,req.body||{})));
router.post('/events/:id/readiness/release',internalOnly,async(req,res)=>res.json(await require('../readiness').release(req.params.id,req.body?.token)));
router.put('/venue-maintenance/:id',internalOnly,async(req,res)=>{
 const {actor,kind,input,operationId}=req.body||{};
 if(!actor?.id||![actor.role,...(actor.roles||[])].includes('VENUE_STAFF')||!['VENUE','HOURS'].includes(kind)||!input)return res.status(422).json({error:{code:'VALIDATION_FAILED',message:'Verified staff maintenance input required'}});
 return res.json(await store.withLocks([workflows.venueLock(req.params.id)],async tx=>{
  await require('../readiness').invalidateVenue(req.params.id,tx,'Venue configuration changed');
  const config=require('../config');
  const response=await fetch(`${config.venueServiceUrl}/internal/venues/${encodeURIComponent(req.params.id)}/maintenance`,{method:'PUT',headers:{'content-type':'application/json','x-internal-api-key':config.internalApiKey},body:JSON.stringify({actor,kind,input,operationId}),signal:AbortSignal.timeout(5000)});
  const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error?.message||'Venue maintenance failed'),{status:response.status,code:result.error?.code});return result;
 }));
});
router.get('/bookings/:id/arrangement-context',internalOnly,async(req,res)=>{const row=await store.getBooking(req.params.id);if(!row)return res.status(404).json({error:{code:'NOT_FOUND',message:'Booking not found'}});res.json(row);});
router.get('/notification-context/:id',internalOnly,async(req,res)=>{
  const row=await store.getBooking(req.params.id);
  if(!row)return res.status(404).json({error:{code:'NOT_FOUND',message:'Booking not found'}});
  const {id,eventId,venueId,status,expiresAt,version,flags}=row;
  const history=(await store.listHistory(venueId)).filter(item=>item.bookingId===id);
  const decisions=history.filter(item=>item.action==='STATUS_CHANGED' && ['CONFIRMED','REJECTED'].includes(item.toStatus));
  const cancellation=history.find(item=>item.action==='EVENT_CANCELLED_VENUE_RELEASED'&&item.changes?.after?.version===version)?.changes;
  const decisionVersion=decisions.sort((a,b)=>(b.changes?.after?.version||0)-(a.changes?.after?.version||0))[0]?.changes?.after?.version ?? null;
  return res.json({id,eventId,venueId,status,expiresAt,version,flags,decisionVersion,originalBookingId:row.originalBookingId,extensionPending:!!row.extensionRequest,cancellationActionId:cancellation?.cancellationActionId||null,cancelledEventVersion:cancellation?.cancelledEventVersion||null});
});
router.get('/buffer-status/:venueId',internalOnly,async(req,res)=>res.json(await require('../legacyBuffers').bufferStatus(req.params.venueId)));
router.get('/legacy-buffer-context/:venueId',internalOnly,async(req,res)=>res.json(await require('../legacyBuffers').preview(req.params.venueId)));
router.put('/buffer-fence-recovery/:venueId',internalOnly,async(req,res)=>{
  if(!Number.isSafeInteger(req.body?.input?.version) || req.body.input.version<1 || typeof req.body?.actor?.id!=='string' || !req.body.actor.id.trim() || typeof req.body?.actor?.role!=='string' || !req.body.actor.role.trim())return res.status(422).json({error:{code:'VALIDATION_ERROR',message:'Current version and verified actor required'}});
  return res.json(await require('../legacyBuffers').recoverFence(req.params.venueId,req.body));
});
router.put('/legacy-buffers/:venueId',internalOnly,async(req,res)=>{
  if(!Number.isSafeInteger(req.body?.version) || req.body.version<1 || typeof req.body?.actor?.id!=='string' || !req.body.actor.id.trim() || typeof req.body?.actor?.role!=='string' || !req.body.actor.role.trim())return res.status(422).json({error:{code:'VALIDATION_ERROR',message:'Current version and verified actor required'}});
  return res.json(await require('../legacyBuffers').configure(req.params.venueId,req.body));
});
router.post('/venue-removals/:venueId',internalOnly,async(req,res)=>{
  if (typeof req.body?.actor?.id!=='string' || typeof req.body?.actor?.role!=='string') return res.status(422).json({error:{code:'VALIDATION_ERROR',message:'Verified actor is required'}});
  const result=await store.withLocks([workflows.venueLock(req.params.venueId)],async tx=>{
    const venue=await venueContext(req.params.venueId),at=await store.transactionNow(tx);
    const count=(await store.listBookings(tx,{venueId:venue.id})).filter(row=>workflows.effective(row,at) && Date.parse(workflows.windowFor(row,venue).endAt)>=at.getTime()).length;
    if(count) return {venueId:venue.id,blockingCount:count,deleted:false};
    await require('../readiness').invalidateVenue(venue.id,tx,'Venue removed');
    return {venueId:venue.id,blockingCount:0,deleted:await removeVenue(venue.id,venue.version,req.body.operationId,req.body.actor)};
  });
  return res.status(result.blockingCount?409:result.deleted?200:404).json(result);
});
router.post('/venue-rechecks',internalOnly,async(req,res)=>{
  const body=req.body || {};
  if (typeof body.venueId!=='string' || !body.venueId.trim() || !Number.isSafeInteger(body.version) || body.version<1 || !body.actor?.id || !body.actor?.role || typeof body.reason!=='string' || !body.reason.trim()) return res.status(422).json({error:{code:'VALIDATION_ERROR',message:'Use a versioned venue change with actor and reason'}});
  return res.json(await workflows.recheck(body));
});

router.get('/venue-links/:venueId', internalOnly, async (req, res) => {
  const blockingCount = await store.countBlockingBookings(req.params.venueId);
  return res.json({
    venueId: req.params.venueId,
    blockingCount,
    statuses: ['TENTATIVELY_HELD', 'CONFIRMED'],
  });
});

module.exports = router;
