const store = require('./store');
const {attendancePlan}=require('./attendancePlan');
const config = require('./config');
const { planningContext,canBookEvent } = require('./eventClient');
const { venueContext,catalogue,lockVenueBuffers } = require('./venueClient');
const { withinHours } = require('./hours');
const { instant } = require('./time');
const clock = require('./clock');
const { occupiedWindow,occupiedWindowsOverlap } = require('./occupiedWindow');
const { validateHoldDeadline,holdWarningDue } = require('./holdClock');
const { isStaff } = require('./policy');
const { hasPermission } = require('../../utils/role-policy');

function fail(status,code,message,fields,details) { throw Object.assign(new Error(message),{status,code,fields,details}); }
function noticeContext(context,venue,booking) {
  return {eventRequestId:context?.eventRequestId ?? null,organiserId:context?.organiserId ?? null,eventName:context?.title ?? booking.title,venueName:venue?.name ?? null,occurredAt:booking.updatedAt};
}
function venueLock(id) { return `booking:venue:${id}`; }
function eventLock(id) { return `booking:event:${id}`; }
function effective(booking,at) {
  if (booking.status === 'TENTATIVELY_HELD') return Boolean(booking.expiresAt) && Date.parse(booking.expiresAt)>at.getTime();
  return ['CONFIRMED','BLOCKED','UNAVAILABLE'].includes(booking.status);
}
function windowFor(booking,venue) {
  // Operational windows already describe the closure's occupied interval.
  return occupiedWindow(booking,['BLOCKED','UNAVAILABLE'].includes(booking.status)?{setupMinutes:0,turnaroundMinutes:0}:venue);
}
function venueRequirements(context) {
  return Object.fromEntries(['startAt','endAt','timeZone','expectedAttendance','minimumCapacity','preferredLayout','venueType','venueRequirements','accessibilityNeeds','accessibilityDetails'].map(key=>[key,context[key] ?? null]));
}
async function contextFor(req,eventId) {
  const context=await planningContext(eventId);
  if (!isStaff(req.actor) && context.currentCoordinatorId !== req.actor.id) fail(403,'FORBIDDEN','Event is not assigned to you');
  return context;
}
function planning(context) {
  if (context.status !== 'ARRANGEMENT_PENDING' || ['PREPARING','PENDING','APPROVED'].includes(context.safetyState)) fail(409,'EVENT_NOT_PLANNING','Venue arrangements require a Planning Event');
}
function needs(input,context) {
  const attendance=input.expectedAttendance ?? context.expectedAttendance;
  if (!Number.isSafeInteger(attendance) || attendance < 1 || attendance > 2147483647) fail(422,'VALIDATION_ERROR','Use a positive whole attendance',{expectedAttendance:['Use a positive whole attendance']});
  const layout=input.layout ?? context.preferredLayout ?? (String(context.venueType).toUpperCase()==='VIRTUAL'?'VIRTUAL':null);
  if (typeof layout !== 'string' || !layout.trim()) fail(422,'VALIDATION_ERROR','Select a room layout',{layout:['Select a room layout']});
  const accessibility=[...new Set([...(context.accessibilityNeeds || []),...(input.accessibilityNeeds || [])].filter(value=>String(value).toUpperCase()!=='NONE'))];
  return {...input,expectedAttendance:attendance,layout,facilities:input.facilities ?? [],accessibilityNeeds:accessibility,required:input.required ?? true,requirements:venueRequirements(context),requirementsFingerprint:store.fingerprint(venueRequirements(context))};
}
function gaps(input,venue) {

  const result=[];
  if(venue.maintenancePending)result.push('VENUE_MAINTENANCE_PENDING');
  if (!venue.isActive) result.push('INACTIVE');
  const expectedType=input.requirements?.venueType?String(input.requirements.venueType).toUpperCase():null;
  if (expectedType && expectedType!==venue.venueType) result.push('VENUE_TYPE');
  const minimum=input.expectedAttendance===input.requirements?.expectedAttendance?Math.max(input.expectedAttendance,input.requirements.minimumCapacity ?? 0):input.expectedAttendance;
  if (venue.venueType !== 'VIRTUAL' && (!Number.isInteger(venue.capacity) || venue.capacity<minimum)) result.push('CAPACITY');
  if (venue.venueType!=='VIRTUAL' && !venue.supportedLayouts?.includes(input.layout)) result.push('LAYOUT');
  for (const facility of input.facilities || []) if (!venue.facilities?.includes(facility)) result.push(`FACILITY:${facility}`);
  for (const tag of input.accessibilityNeeds || []) if (!venue.accessibilityTags?.includes(tag)) result.push(`ACCESSIBILITY:${tag}`);
  if (!withinHours(windowFor(input,venue),venue)) result.push('OUTSIDE_OPERATING_HOURS');
  return result;
}
function checkedNeeds(input,context,venue) {
  const value=needs(input,context);
  if (Date.parse(value.startAt)<Date.parse(context.startAt) || Date.parse(value.endAt)>Date.parse(context.endAt)) fail(422,'OUTSIDE_EVENT','Booking must fit within the Event time window',{startAt:['Use a time within the Event'],endAt:['Use a time within the Event']});
  const missing=gaps(value,venue);
  if (missing.length) fail(422,'VENUE_UNSUITABLE','Venue does not satisfy the room requirements',{venueId:missing},{gaps:missing});
  return value;
}
async function conflicts(input,venue,at,tx,excludeId) {
  const candidate=windowFor(input,venue);
  return (await store.listBookings(tx,{venueId:venue.id})).filter(row=>row.id!==excludeId && effective(row,at) && occupiedWindowsOverlap(candidate,windowFor(row,venue),{allowTouching:config.allowTouching}));
}
function deadline(input,occupied,at,preserveExtension=false) {
  const cap=Date.parse(occupied.startAt)-(config.allowExpiryAtSetup?0:1);
  const defaultAt=Math.min(at.getTime()+config.holdHours*3600000,cap);
  const expiresAt=input.expiresAt ?? new Date(defaultAt).toISOString();
  try { validateHoldDeadline({createdAt:at.toISOString(),expiresAt,occupiedStartAt:occupied.startAt},{allowExpiryAtOccupiedStart:config.allowExpiryAtSetup}); }
  catch { fail(422,'VALIDATION_ERROR','Hold deadline must be in the future and no later than setup',{expiresAt:['Use a future deadline no later than the occupied start']}); }
  if (!preserveExtension && Date.parse(expiresAt)>defaultAt) fail(422,'VALIDATION_ERROR','Initial hold exceeds the configured default',{expiresAt:['Only Venue Staff can extend an active hold']});
  return new Date(expiresAt).toISOString();
}
function version(current,value) {
  if (!Number.isSafeInteger(value) || value<1) fail(422,'VALIDATION_ERROR','Reload the booking before saving',{version:['Current booking version is required']});
  if (current.version!==value) fail(409,'STALE_BOOKING','This booking has changed. Reload before deciding.');
}
function activeHold(current,at) {
  if (current.status!=='TENTATIVELY_HELD') fail(409,'ALREADY_DECIDED','Only an active tentative hold can be decided or extended');
  if (!effective(current,at)) fail(409,'HOLD_EXPIRED','This hold has expired. Request a new hold.');
}
async function decision(req,id,body) {
  const first=await store.getBooking(id);
  if (!first) fail(404,'NOT_FOUND','Booking not found');
  return store.withLocks([eventLock(first.eventId),venueLock(first.venueId)],async(tx,at)=>{
    const current=await store.getBooking(id,tx);
    if (!current) fail(404,'NOT_FOUND','Booking not found');
    version(current,body.version);
    activeHold(current,at);
    const context=await contextFor(req,current.eventId);
    planning(context);
    let venue=await venueContext(current.venueId);
    at=await store.transactionNow(tx);activeHold(current,at);
    let input={...current,status:body.status,reason:body.reason.trim(),expiresAt:null,extensionRequest:null,flags:[]};
    if (body.status==='CONFIRMED') {
      if (current.requirementsFingerprint && current.requirementsFingerprint!==store.fingerprint(venueRequirements(context))) fail(409,'REQUIREMENTS_CHANGED','Event requirements changed. The Coordinator must review this booking before approval.');
      input=checkedNeeds(input,context,venue);
      const competing=await conflicts(input,venue,at,tx,current.id);
      if (competing.length || current.flags?.some(flag=>!managedFlag(flag))) fail(409,'VENUE_CONFLICT','Resolve current venue conflicts before approval',undefined,{conflicts:competing.map(row=>({id:row.id,status:row.status,occupiedWindow:windowFor(row,venue)}))});
      venue=await lockVenueBuffers(venue,req.actor);
      activeHold(current,await store.transactionNow(tx));
      const occupied=windowFor(input,venue);
      input={...input,setupMinutes:venue.setupMinutes,turnaroundMinutes:venue.turnaroundMinutes,venueVersion:venue.version,occupiedStart:occupied.startAt,occupiedEnd:occupied.endAt};
    }
    const saved=await store.replaceBooking(current,input,req.actor,tx);
    await store.addOutbox(saved,body.status==='CONFIRMED'?'VenueBookingApproved':'VenueBookingRejected',{...noticeContext(context,venue,saved),bookingId:saved.id,eventId:saved.eventId,venueId:saved.venueId,coordinatorId:context.currentCoordinatorId,actorId:req.actor.id,reason:input.reason,version:saved.version},tx);
    await recheckInTransaction(venue,req.actor,'Venue decision changed the effective commitments',tx,await store.transactionNow(tx));
    return saved;
  });
}
function extensionDeadline(current,body,occupied,at) {
  if ((current.extensionCount ?? 0)>=1) fail(409,'EXTENSION_LIMIT','This hold has already used its one extension');
  try {validateHoldDeadline({createdAt:at.toISOString(),expiresAt:body.expiresAt,occupiedStartAt:occupied.startAt},{allowExpiryAtOccupiedStart:config.allowExpiryAtSetup});}
  catch {fail(422,'VALIDATION_ERROR','Use a future deadline no later than setup',{expiresAt:['Use a future deadline no later than the occupied start']});}
  const extra=Date.parse(body.expiresAt)-Date.parse(current.expiresAt);
  if(extra<=0 || extra>24*3600000)fail(422,'VALIDATION_ERROR','An extension must add at most 24 hours',{expiresAt:['Choose a later deadline within 24 hours of the current expiry']});
}
async function requestExtension(req,id,body) {
  if(!hasPermission(req.actor,'venue_bookings.create'))fail(403,'FORBIDDEN','Only the assigned Coordinator may request an extension');
  const first=await store.getBooking(id);
  if(!first)fail(404,'NOT_FOUND','Booking not found');
  return store.withLocks([eventLock(first.eventId),venueLock(first.venueId)],async(tx,at)=>{
    const current=await store.getBooking(id,tx);version(current,body.version);activeHold(current,at);
    const context=await contextFor(req,current.eventId);
    if(context.currentCoordinatorId!==req.actor.id)fail(403,'FORBIDDEN','Event is not assigned to you');
    planning(context);
    const venue=await venueContext(current.venueId);
    at=await store.transactionNow(tx);activeHold(current,at);
    extensionDeadline(current,body,windowFor(current,venue),at);
    const extensionRequest={requestedById:req.actor.id,requestedAt:at.toISOString(),expiresAt:new Date(body.expiresAt).toISOString(),reason:body.reason.trim()};
    const saved=await store.replaceBooking(current,{...current,extensionRequest,activityAction:'HOLD_EXTENSION_REQUESTED',activityReason:extensionRequest.reason},req.actor,tx);
    await store.addOutbox(saved,'VenueHoldExtensionRequested',{...noticeContext(context,venue,saved),bookingId:saved.id,eventId:saved.eventId,venueId:saved.venueId,coordinatorId:req.actor.id,...extensionRequest,version:saved.version},tx);
    return saved;
  });
}
async function extend(req,id,body) {
  const first=await store.getBooking(id);
  if (!first) fail(404,'NOT_FOUND','Booking not found');
  return store.withLocks([eventLock(first.eventId),venueLock(first.venueId)],async(tx,at)=>{
    const current=await store.getBooking(id,tx);
    if (!current) fail(404,'NOT_FOUND','Booking not found');
    version(current,body.version);activeHold(current,at);
    const context=await contextFor(req,current.eventId);planning(context);
    const venue=await venueContext(current.venueId),occupied=windowFor(current,venue);
    at=await store.transactionNow(tx);activeHold(current,at);
    extensionDeadline(current,body,occupied,at);
    if(!current.extensionRequest || current.extensionRequest.requestedById!==context.currentCoordinatorId || Date.parse(current.extensionRequest.expiresAt)!==Date.parse(body.expiresAt))fail(409,'EXTENSION_REQUEST_REQUIRED','The current Coordinator must request this deadline before Staff approves it');
    const input={...current,expiresAt:new Date(body.expiresAt).toISOString(),extensionCount:1,extensionRequest:null,reason:body.reason.trim(),activityAction:'HOLD_EXTENDED'};
    const saved=await store.replaceBooking(current,input,req.actor,tx);
    await store.addOutbox(saved,'VenueHoldExtended',{...noticeContext(context,venue,saved),bookingId:saved.id,eventId:saved.eventId,venueId:saved.venueId,coordinatorId:context.currentCoordinatorId,oldExpiresAt:current.expiresAt,expiresAt:saved.expiresAt,actorId:req.actor.id,reason:input.reason,version:saved.version},tx);
    return saved;
  });
}
async function create(req,input,key) {
  const original=store.fingerprint(input);
  return store.withLocks([...(input.eventId?[eventLock(input.eventId)]:[]),venueLock(input.venueId),`booking:idempotency:${req.actor.id}:${key}`],async(tx,at)=>{
    const context=input.eventId?await contextFor(req,input.eventId):null;
    const existing=await store.findIdempotency(req.actor.id,key,tx);
    if (existing) {
      if (existing.fingerprint!==original) fail(409,'IDEMPOTENCY_KEY_REUSE','Idempotency key was reused with a different booking');
      return {status:200,booking:await store.getBooking(existing.bookingId,tx)};
    }
    const venue=await venueContext(input.venueId);
    if(['BLOCKED','UNAVAILABLE'].includes(input.status))await require('./readiness').invalidateVenue(venue.id,tx,'Operational venue availability changed');
    at=await store.transactionNow(tx);
    const operational=['BLOCKED','UNAVAILABLE'].includes(input.status);
    let value={...input};
    if (!operational) { if (!context) fail(422,'VALIDATION_ERROR','Event is required',{eventId:['Event is required']});if(context.currentCoordinatorId!==req.actor.id)fail(403,'FORBIDDEN','Event is not assigned to you');planning(context);value=checkedNeeds(input,context,venue); }
    const occupied=windowFor(value,venue);
    if (!operational && input.status==='TENTATIVELY_HELD') {
      const competing=await conflicts(value,venue,at,tx);
      if (competing.length) fail(409,'VENUE_CONFLICT','This venue is occupied during the requested setup, event or turnaround window',undefined,{conflicts:competing.map(row=>({id:row.id,status:row.status,occupiedWindow:windowFor(row,venue)}))});
    }
    value={...value,createdAt:at.toISOString(),setupMinutes:operational?0:venue.setupMinutes,turnaroundMinutes:operational?0:venue.turnaroundMinutes,venueVersion:venue.version,occupiedStart:occupied.startAt,occupiedEnd:occupied.endAt,expiresAt:input.status==='TENTATIVELY_HELD'?deadline(input,occupied,at):null,flags:[],requestFingerprint:original};
    const booking=await store.createBooking(value,req.actor,key,tx);
    await store.addOutbox(booking,input.status==='CANCELLED'?'VenueCancelled':operational?'VenueBlocked':'VenueRequested',{...noticeContext(context,venue,booking),bookingId:booking.id,eventId:booking.eventId,venueId:booking.venueId,coordinatorId:context?.currentCoordinatorId ?? null,actorId:req.actor.id,version:booking.version},tx);
    if(booking.status==='TENTATIVELY_HELD' && holdWarningDue(booking.expiresAt,at.toISOString(),24*3600000))await store.addOutbox(booking,'VenueHoldExpiring',{...noticeContext(context,venue,booking),bookingId:booking.id,eventId:booking.eventId,venueId:booking.venueId,coordinatorId:context.currentCoordinatorId,expiresAt:booking.expiresAt,version:booking.version},tx);
    await recheckInTransaction(venue,req.actor,'Venue commitment added',tx,await store.transactionNow(tx));
    return {status:201,booking:await store.getBooking(booking.id,tx)};
  });
}

async function replace(req,id,input,body) {
  const first=await store.getBooking(id);
  if (!first) fail(404,'NOT_FOUND','Booking not found');
  if (!isStaff(req.actor) && !['TENTATIVELY_HELD','CANCELLED'].includes(input.status)) fail(403,'FORBIDDEN','Venue Staff decision permission is required for this status');
  if (isStaff(req.actor) && ['CONFIRMED','REJECTED'].includes(input.status)) {
    for (const field of ['venueId','eventId','startAt','endAt']) if (input[field] !== first[field]) fail(422,'VALIDATION_ERROR','A decision cannot change the requested room or time',{[field]:['Review the existing booking; the Coordinator owns arrangement changes']});
    return decision(req,id,body);
  }
  return store.withLocks([...(first.eventId?[eventLock(first.eventId)]:[]),venueLock(first.venueId),venueLock(input.venueId)],async(tx,at)=>{
    const current=await store.getBooking(id,tx);
    if (!current) fail(404,'NOT_FOUND','Booking not found');
    version(current,body.version);
    if (input.eventId && input.eventId!==current.eventId) fail(422,'VALIDATION_ERROR','A booking cannot move to another Event',{eventId:['Create a separate booking for another Event']});
    const operational=['BLOCKED','UNAVAILABLE'].includes(current.status);
    let context=null;
    if (!operational) {
      context=await contextFor(req,current.eventId);planning(context);
      if (!hasPermission(req.actor,'venue_bookings.create') || context.currentCoordinatorId!==req.actor.id || !(['TENTATIVELY_HELD','CANCELLED','REJECTED'].includes(current.status) || current.status==='CONFIRMED' && input.status==='CANCELLED' && context.safetyRework?.reviewedById===req.actor.id && context.safetyRework?.bookingIds?.includes(current.id)) || !['TENTATIVELY_HELD','CANCELLED'].includes(input.status)) fail(403,'FORBIDDEN','Only the assigned Coordinator may change an unapproved venue arrangement');
      if (current.status==='TENTATIVELY_HELD' && !effective(current,at) && input.status!=='CANCELLED') fail(409,'HOLD_EXPIRED','Request a new hold after expiry');
    } else if (!isStaff(req.actor) || !['BLOCKED','UNAVAILABLE','CANCELLED'].includes(input.status)) fail(403,'FORBIDDEN','Only Venue Staff may edit or release an operational window');
    if(operational)for(const venueId of new Set([current.venueId,input.venueId]))await require('./readiness').invalidateVenue(venueId,tx,'Operational venue availability changed');
    let value={...current,...input,eventId:current.eventId,extensionRequest:null};
    if (input.status==='CANCELLED') {value.expiresAt=null;value.flags=[];}
    else {
      const venue=await venueContext(input.venueId);
      at=await store.transactionNow(tx);
      if (current.status==='TENTATIVELY_HELD' && !effective(current,at)) fail(409,'HOLD_EXPIRED','Request a new hold after expiry');
      if (!operational) value=checkedNeeds(value,context,venue);
      const occupied=windowFor(value,venue);
      if (!operational && (await conflicts(value,venue,at,tx,id)).length) fail(409,'VENUE_CONFLICT','The replacement room or time is occupied');
      let expiresAt=null;
      if (!operational) {
        const cap=Date.parse(occupied.startAt)-(config.allowExpiryAtSetup?0:1);
        const proposed=current.status==='TENTATIVELY_HELD'?new Date(Math.min(Date.parse(current.expiresAt),cap)).toISOString():undefined;
        expiresAt=deadline({...value,expiresAt:proposed},occupied,at,current.status==='TENTATIVELY_HELD');
      }
      value={...value,setupMinutes:operational?0:venue.setupMinutes,turnaroundMinutes:operational?0:venue.turnaroundMinutes,occupiedStart:occupied.startAt,occupiedEnd:occupied.endAt,venueVersion:venue.version,expiresAt,flags:[]};
    }
    const saved=await store.replaceBooking(current,value,req.actor,tx);
    await store.addOutbox(saved,input.status==='CANCELLED'?'VenueCancelled':operational?'VenueBlocked':'VenueRequested',{...noticeContext(context,null,saved),bookingId:saved.id,eventId:saved.eventId,venueId:saved.venueId,coordinatorId:context?.currentCoordinatorId ?? null,actorId:req.actor.id,reason:value.reason,version:saved.version},tx);
    if(saved.status==='TENTATIVELY_HELD' && (current.status!=='TENTATIVELY_HELD' || current.expiresAt!==saved.expiresAt) && holdWarningDue(saved.expiresAt,(await store.transactionNow(tx)).toISOString(),24*3600000))await store.addOutbox(saved,'VenueHoldExpiring',{...noticeContext(context,null,saved),bookingId:saved.id,eventId:saved.eventId,venueId:saved.venueId,coordinatorId:context.currentCoordinatorId,expiresAt:saved.expiresAt,version:saved.version},tx);
    for(const venueId of [...new Set([current.venueId,saved.venueId])]) {
      let venue;
      try{venue=await venueContext(venueId);}catch(error){
        const retiredOrigin=venueId===current.venueId && venueId!==saved.venueId && ['REJECTED','CANCELLED'].includes(current.status);
        if(error.status===404 && (input.status==='CANCELLED' || retiredOrigin))continue;
        throw error;
      }
      await recheckInTransaction(venue,req.actor,'Venue commitment changed or released',tx,await store.transactionNow(tx));
    }
    return store.getBooking(saved.id,tx);
  });
}

async function selectPrimaryVenue(req,eventId,body) {
  if(!hasPermission(req.actor,'venue_bookings.create'))fail(403,'FORBIDDEN','Only the assigned Coordinator may choose the primary venue');
  if(typeof body.bookingId!=='string' || !body.bookingId.trim() || !Number.isSafeInteger(body.version) || body.version<0)fail(422,'VALIDATION_ERROR','Use a booking and the current primary-selection version');
  return store.withLocks([eventLock(eventId)],async tx=>{
    const context=await contextFor(req,eventId);
    if(context.currentCoordinatorId!==req.actor.id)fail(403,'FORBIDDEN','Event is not assigned to you');
    planning(context);
    const booking=await store.getBooking(body.bookingId,tx);
    if(!booking || booking.eventId!==eventId)fail(404,'NOT_FOUND','Event booking not found');
    await store.lockMore(tx,[venueLock(booking.venueId)]);
    const currentBooking=await store.getBooking(booking.id,tx);
    version(currentBooking,body.bookingVersion);
    const selection=await store.primaryVenue(eventId,tx);
    if(selection.version!==body.version)fail(409,'STALE_PRIMARY_VENUE','Primary venue changed. Refresh before selecting.');
    if(!['TENTATIVELY_HELD','CONFIRMED'].includes(currentBooking.status) || !effective(currentBooking,await store.transactionNow(tx)))fail(409,'INACTIVE_BOOKING','Select an active venue arrangement');
    const venue=await venueContext(currentBooking.venueId);
    if(!venue.isActive)fail(409,'INACTIVE_VENUE','Select an active venue');
    const at=await store.transactionNow(tx);
    if(!effective(currentBooking,at))fail(409,'INACTIVE_BOOKING','The hold has expired');
    if(gaps(currentBooking,venue).length || (currentBooking.flags || []).some(flag=>!managedFlag(flag)) || currentBooking.requirementsFingerprint!==store.fingerprint(venueRequirements(context)) || (await conflicts(currentBooking,venue,at,tx,currentBooking.id)).length)fail(409,'VENUE_NOT_READY','Refresh and resolve the room requirements or conflicts before choosing it as primary');
    if(!effective(currentBooking,await store.transactionNow(tx)))fail(409,'INACTIVE_BOOKING','The hold has expired');
    if(selection.bookingId===currentBooking.id)return selection;
    return store.setPrimaryVenue(eventId,currentBooking,req.actor,selection,tx);
  });
}

async function summary(req,eventId,{allowMissingEvent=false,transaction}={}) {
  const project=async(tx)=>{
    let context;
    try{context=!eventId && allowMissingEvent && isStaff(req.actor)?null:await contextFor(req,eventId);}catch(error){
      if(!allowMissingEvent || !isStaff(req.actor) || error.code!=='EVENT_NOT_FOUND')throw error;
      context=null;
    }
    const rows=(await store.listBookings(tx,{eventId})).filter(row=>row.eventId===eventId);
    await store.lockMore(tx,rows.map(row=>venueLock(row.venueId)));
    const venues=new Map(),items=[],outstanding=[];
    for (const row of rows) {
      if (!venues.has(row.venueId)) {
        try {venues.set(row.venueId,await venueContext(row.venueId));}
        catch(error) {
          if(error.status!==404)throw error;
          venues.set(row.venueId,{id:row.venueId,name:`Removed venue (${row.venueId})`,removed:true,venueType:row.requirements?.venueType || 'PHYSICAL',isActive:false,capacity:null,setupMinutes:row.setupMinutes ?? 0,turnaroundMinutes:row.turnaroundMinutes ?? 0,supportedLayouts:[],facilities:[],accessibilityTags:[],operatingHours:[],timeZone:row.timeZone,version:row.venueVersion});
        }
      }
    }
    // Slow upstream reads must finish before the effective-deadline projection.
    const at=await store.transactionNow(tx);
    for (const row of rows) {
      const venue=venues.get(row.venueId),occupied=windowFor(row,venue);
      const flags=new Set((row.flags || []).filter(flag=>!managedFlag(flag)));
      if (venue.removed && row.status!=='CANCELLED') flags.add('VENUE_REMOVED');
      if (['CONFIRMED','TENTATIVELY_HELD'].includes(row.status) && effective(row,at)) {
        for (const gap of gaps(row,venue)) flags.add(gap);
        if (!context) flags.add('EVENT_NOT_FOUND');
        else if (!row.requirementsFingerprint || row.requirementsFingerprint!==store.fingerprint(venueRequirements(context))) flags.add('REQUIREMENTS_CHANGED');
        if ((await conflicts(row,venue,at,tx,row.id)).length) flags.add('BUFFER_CONFLICT');
      }
      const expired=row.status==='TENTATIVELY_HELD' && !effective(row,at);
      const item={...row,venueName:venue.name,venueType:venue.removed?null:venue.venueType,venueCapacity:venue.capacity,currentVenueVersion:venue.version,emergencyAccess:venue.emergencyAccess??null,crowdMovement:venue.crowdMovement??null,restrictions:venue.restrictions??null,venueTimeZone:venue.timeZone,organiserId:context?.organiserId ?? null,currentCoordinatorId:context?.currentCoordinatorId ?? null,eventStatus:context?.status ?? null,currentVenueNotes:context?.venueRequirements ?? null,occupiedStart:occupied.startAt,occupiedEnd:occupied.endAt,setupMinutes:venue.setupMinutes,turnaroundMinutes:venue.turnaroundMinutes,flags:[...flags],effectiveStatus:expired?'EXPIRED':row.status};
      items.push(item);
      if (row.required && row.status!=='CANCELLED' && (row.status!=='CONFIRMED' || flags.size)) outstanding.push({bookingId:row.id,venueId:row.venueId,venueName:venue.name,reasons:[...(row.status!=='CONFIRMED'?[expired?'HOLD_EXPIRED':row.status]:[]),...flags]});
    }
    if (!rows.some(row=>row.required && row.status!=='CANCELLED')) outstanding.push({bookingId:null,reasons:['NO_VENUE_BOOKING']});
    const allocations=attendancePlan(context,items);
    for(const session of allocations.sessions)if(session.reason)outstanding.push({bookingId:null,reasons:[session.reason],startAt:session.startAt,endAt:session.endAt,allocated:session.allocated,expectedAttendance:allocations.expectedAttendance});
    const primaryVenue=await store.primaryVenue(eventId,tx);
    const primary=items.find(row=>row.id===primaryVenue.bookingId);
    return {event:context,items,attendancePlan:allocations,primaryVenue:{...primaryVenue,available:Boolean(primary && ['TENTATIVELY_HELD','CONFIRMED'].includes(primary.effectiveStatus) && !primary.flags.length)},venueReady:outstanding.length===0,outstanding,checkedAt:at.toISOString(),policy:{allowTouching:config.allowTouching,holdHours:config.holdHours,allowExpiryAtSetup:config.allowExpiryAtSetup,extensionHours:24,maxExtensions:1,warningHours:24,status:'TEAM_AGREED',pendingClarifications:[]}};
  };
  // The memory adapter represents an already-held transaction with null.
  return transaction!==undefined?project(transaction):store.withLocks([eventLock(eventId)],project);
}

function managedFlag(flag) { return ['VENUE_MAINTENANCE_PENDING','BUFFER_CONFLICT','CAPACITY','LAYOUT','VENUE_TYPE','INACTIVE','OUTSIDE_OPERATING_HOURS','EVENT_NOT_FOUND','REQUIREMENTS_CHANGED'].includes(flag) || /^(FACILITY|ACCESSIBILITY):/.test(flag); }
async function recheckContext(eventId) {
  if(!eventId) return null;
  try{return await planningContext(eventId);}catch(error){if(error.status===404)return null;throw error;}
}
async function recheckInTransaction(venue,actor,reason,tx,at) {
  const candidates=(await store.listBookings(tx,{venueId:venue.id})).filter(row=>effective(row,at) && Date.parse(windowFor(row,venue).endAt)>at.getTime()),changed=[],contexts=new Map();
  for(const row of candidates.filter(row=>['CONFIRMED','TENTATIVELY_HELD'].includes(row.status))) if(!contexts.has(row.eventId)) contexts.set(row.eventId,await recheckContext(row.eventId));
  at=await store.transactionNow(tx);
  const rows=candidates.filter(row=>effective(row,at) && Date.parse(windowFor(row,venue).endAt)>at.getTime());
  for (const current of rows) {
    const operational=['BLOCKED','UNAVAILABLE'].includes(current.status),occupied=windowFor(current,venue);
    const flags=new Set((current.flags || []).filter(flag=>!managedFlag(flag)));
    if (!operational) {
      for (const gap of gaps(current,venue)) flags.add(gap);
      const context=contexts.get(current.eventId);
      if(!context) flags.add('EVENT_NOT_FOUND');
      else if(!current.requirementsFingerprint || current.requirementsFingerprint!==store.fingerprint(venueRequirements(context))) flags.add('REQUIREMENTS_CHANGED');
    }
    if (rows.some(other=>other.id!==current.id && occupiedWindowsOverlap(occupied,windowFor(other,venue),{allowTouching:config.allowTouching}))) flags.add('BUFFER_CONFLICT');
    const nextFlags=[...flags].sort(),flagChanged=JSON.stringify(nextFlags)!==JSON.stringify([...(current.flags || [])].sort());
    if (!flagChanged && current.venueVersion===venue.version && current.occupiedStart===occupied.startAt && current.occupiedEnd===occupied.endAt) continue;
    const saved=await store.replaceBooking(current,{...current,venueVersion:venue.version,setupMinutes:operational?0:venue.setupMinutes,turnaroundMinutes:operational?0:venue.turnaroundMinutes,occupiedStart:occupied.startAt,occupiedEnd:occupied.endAt,flags:nextFlags,activityAction:'VENUE_RECHECKED',activityReason:reason},actor,tx);
    if (flagChanged) {
      const context=contexts.get(current.eventId);
      await store.addOutbox(saved,!operational&&rows.some(other=>other.id!==current.id&&['BLOCKED','UNAVAILABLE'].includes(other.status)&&occupiedWindowsOverlap(occupied,windowFor(other,venue),{allowTouching:config.allowTouching}))?'VenueUnavailable':'VenueConflictChanged',{...noticeContext(context,venue,saved),bookingId:saved.id,eventId:saved.eventId,venueId:saved.venueId,coordinatorId:context?.currentCoordinatorId ?? null,venueVersion:venue.version,flags:nextFlags,previousFlags:current.flags || [],actorId:actor.id,reason,version:saved.version},tx);
    }
    changed.push(saved.id);
  }
  return {venueId:venue.id,version:venue.version,changed};
}
async function recheck(body) {
  return store.withLocks([venueLock(body.venueId)],async(tx,at)=>{
    const venue=await venueContext(body.venueId);
    if (venue.version<body.version) fail(409,'VENUE_VERSION_PENDING','Venue configuration has not reached this version yet');
    return recheckInTransaction(venue,body.actor,body.reason,tx,at);
  });
}

async function staffRecheck(req,body) {
  return store.withLocks([venueLock(body.venueId)],async tx=>{
    const venue=await venueContext(body.venueId);
    if (venue.version!==body.version) fail(409,'STALE_VENUE','Venue settings changed. Refresh before rechecking.');
    return recheckInTransaction(venue,req.actor,body.reason.trim(),tx,await store.transactionNow(tx));
  });
}

async function conflictReport(req,query) {
  const firstAt=clock.now();
  const first=(await store.listBookings(null,query.venueId?{venueId:query.venueId}:{})).filter(row=>effective(row,firstAt));
  const venueIds=[...new Set(query.venueId?[query.venueId]:first.map(row=>row.venueId))];
  return store.withLocks(venueIds.map(venueLock),async tx=>{
    const venues=new Map(),contexts=new Map();
    const beforeReads=await store.transactionNow(tx);
    const rows=(await store.listBookings(tx,query.venueId?{venueId:query.venueId}:{})).filter(row=>venueIds.includes(row.venueId) && effective(row,beforeReads));
    for(const venueId of venueIds) {
      try{venues.set(venueId,await venueContext(venueId));}catch(error){
        const historic=rows.filter(row=>row.venueId===venueId);
        if(error.status===404 && !query.venueId && !historic.length)continue;
        // Serialized removal checks the current occupied end while retaining
        // this same lock. A past advertised row cannot veto legitimate removal
        // using an old, longer turnaround snapshot. Ongoing/future rows fail closed.
        if(error.status!==404 || !historic.length || historic.some(row=>Date.parse(row.endAt)>beforeReads.getTime()))throw error;
      }
    }
    const candidates=rows.filter(row=>venues.has(row.venueId) && Date.parse(windowFor(row,venues.get(row.venueId)).endAt)>beforeReads.getTime());
    for(const row of candidates.filter(row=>['CONFIRMED','TENTATIVELY_HELD'].includes(row.status))) if(!contexts.has(row.eventId)) contexts.set(row.eventId,await recheckContext(row.eventId));
    const at=await store.transactionNow(tx),future=candidates.filter(row=>effective(row,at) && Date.parse(windowFor(row,venues.get(row.venueId)).endAt)>at.getTime());
    const items=[];
    for(const row of future.filter(row=>['CONFIRMED','TENTATIVELY_HELD'].includes(row.status))) {
      const venue=venues.get(row.venueId),context=contexts.get(row.eventId),occupied=windowFor(row,venue);
      const competing=future.filter(other=>other.id!==row.id && other.venueId===row.venueId && occupiedWindowsOverlap(occupied,windowFor(other,venue),{allowTouching:config.allowTouching}));
      const flags=new Set((row.flags || []).filter(flag=>!managedFlag(flag)));
      for(const gap of gaps(row,venue)) flags.add(gap);
      if(!context) flags.add('EVENT_NOT_FOUND');
      else if (!row.requirementsFingerprint || row.requirementsFingerprint!==store.fingerprint(venueRequirements(context))) flags.add('REQUIREMENTS_CHANGED');
      if(competing.length) flags.add('BUFFER_CONFLICT');
      if(!flags.size) continue;
      items.push({...row,venueName:venue.name,venueCapacity:venue.capacity,currentVenueVersion:venue.version,venueVersion:venue.version,currentCoordinatorId:context?.currentCoordinatorId ?? null,occupiedStart:occupied.startAt,occupiedEnd:occupied.endAt,setupMinutes:venue.setupMinutes,turnaroundMinutes:venue.turnaroundMinutes,flags:[...flags].sort(),conflicts:competing.map(other=>{const interval=windowFor(other,venue);return {id:other.id,eventId:other.eventId,title:other.title,status:other.status,currentCoordinatorId:contexts.get(other.eventId)?.currentCoordinatorId ?? null,occupiedStart:interval.startAt,occupiedEnd:interval.endAt};})});
    }
    return {items,total:items.length,venues:[...venues.values()].map(venue=>({id:venue.id,name:venue.name,version:venue.version,timeZone:venue.timeZone,setupMinutes:venue.setupMinutes,turnaroundMinutes:venue.turnaroundMinutes})),checkedAt:at.toISOString()};
  });
}

function searchInput(query,context) {
  const startAt=query.startAt ?? context.startAt,endAt=query.endAt ?? context.endAt;
  try {if (instant(endAt,'endAt')<=instant(startAt,'startAt')) throw new Error('order');}
  catch {fail(422,'VALIDATION_ERROR','Use a positive ISO time window with explicit offsets',{startAt:['Use valid, unambiguous instants'],endAt:['End must follow start']});}
  const list=key=>query[key]===undefined?undefined:typeof query[key]==='string'?query[key].split(',').map(s=>s.trim()).filter(Boolean):fail(422,'VALIDATION_ERROR','Use comma-separated requirements',{[key]:['Use comma-separated values']});
  const attendance=query.expectedAttendance===undefined?context.expectedAttendance:typeof query.expectedAttendance==='string' && /^\d+$/.test(query.expectedAttendance)?Number(query.expectedAttendance):NaN;
  const input=needs({startAt,endAt,expectedAttendance:attendance,layout:query.layout ?? context.preferredLayout,facilities:list('facilities'),accessibilityNeeds:list('accessibilityNeeds'),status:'TENTATIVELY_HELD'},context);
  if (Date.parse(startAt)<Date.parse(context.startAt) || Date.parse(endAt)>Date.parse(context.endAt)) fail(422,'OUTSIDE_EVENT','Search window must fit within the Event',{startAt:['Use a time within the Event'],endAt:['Use a time within the Event']});
  return input;
}
async function search(req,eventId,query) {
  const context=await contextFor(req,eventId);planning(context);
  if (context.currentCoordinatorId!==req.actor.id) fail(403,'FORBIDDEN','Only the current assigned Coordinator may search for this Event');
  let source=null;
  if(query.bookingId!==undefined) {
    if(typeof query.bookingId!=='string' || !query.bookingId.trim()) fail(422,'VALIDATION_ERROR','Use a booking ID',{bookingId:['Use one booking ID']});
    source=await store.getBooking(query.bookingId);
    if(!source || source.eventId!==eventId) fail(404,'BOOKING_NOT_FOUND','Booking not found for this Event');
    if(typeof query.bookingVersion!=='string' || !/^[1-9]\d*$/.test(query.bookingVersion)) fail(422,'VALIDATION_ERROR','Refresh the source booking before searching',{bookingVersion:['Current booking version is required']});
    version(source,Number(query.bookingVersion));
  }
  const defaults=source?{startAt:source.startAt,endAt:source.endAt,expectedAttendance:String(source.expectedAttendance ?? context.expectedAttendance),layout:source.layout ?? context.preferredLayout,facilities:(source.facilities || []).join(','),accessibilityNeeds:(source.accessibilityNeeds || []).join(',')}:{};
  const criteria=searchInput({...defaults,...query},context),venues=await catalogue(),at=clock.now(),items=[];
  const location=String(query.location || '').trim().toLowerCase();
  for(const venue of venues) {
    if(source && venue.id===source.venueId) continue;
    if (location && !`${venue.name} ${venue.address || ''}`.toLowerCase().includes(location)) continue;
    const missing=gaps(criteria,venue);
    if (missing.some(g=>['INACTIVE','CAPACITY','VENUE_TYPE','OUTSIDE_OPERATING_HOURS'].includes(g))) continue;
    if ((await conflicts({...criteria,venueId:venue.id},venue,at)).length) continue;
    const occupied=windowFor(criteria,venue);
    items.push({...venue,expectedAttendance:criteria.expectedAttendance,layout:criteria.layout,occupiedStart:occupied.startAt,occupiedEnd:occupied.endAt,match:missing.length?'PARTIAL':'FULL',gaps:missing,canRequest:!missing.length});
  }
  items.sort((a,b)=>(a.match==='FULL'?0:1)-(b.match==='FULL'?0:1) || a.name.localeCompare(b.name));
  return {eventId,criteria,items,total:items.length,checkedAt:at.toISOString(),sourceBooking:source?{id:source.id,venueId:source.venueId,version:source.version,status:source.status}:null};
}
async function availability(req,query) {
  const at=clock.now(),rows=(await store.listBookings()).filter(row=>(!query.venueId || row.venueId===query.venueId) && effective(row,at));
  const venues=new Map(),access=new Map(),items=[];
  for(const row of rows) {
    if (!venues.has(row.venueId)) {
      try{venues.set(row.venueId,await venueContext(row.venueId));}catch(error){
        // A legitimately removed venue can retain immutable past confirmations.
        // Missing venues with a current occupied window still fail closed.
        if(error.status===404 && (!effective(row,clock.now()) || Date.parse(row.endAt)<=clock.now().getTime()))continue;
        throw error;
      }
    }
    const venue=venues.get(row.venueId),occupied=windowFor(row,venue);
    if (query.startAt && Date.parse(occupied.endAt)<=Date.parse(query.startAt)) continue;
    if (query.endAt && Date.parse(occupied.startAt)>=Date.parse(query.endAt)) continue;
    let visible=isStaff(req.actor);
    if (!visible && row.eventId && hasPermission(req.actor,'venue_bookings.create')) {if (!access.has(row.eventId)) access.set(row.eventId,await canBookEvent(req,row.eventId));visible=access.get(row.eventId);}
    const timing={id:row.id,venueId:row.venueId,status:row.status,startAt:row.startAt,endAt:row.endAt,timeZone:venue.timeZone,setupMinutes:['BLOCKED','UNAVAILABLE'].includes(row.status)?0:venue.setupMinutes,turnaroundMinutes:['BLOCKED','UNAVAILABLE'].includes(row.status)?0:venue.turnaroundMinutes,occupiedStart:occupied.startAt,occupiedEnd:occupied.endAt};
    // Operational closure titles are shared calendar labels. Customer Event
    // titles and all private reasons still require the booking's current access.
    items.push(visible?{...row,...timing,...(!isStaff(req.actor)?{currentCoordinatorId:req.actor.id}:{})}:{...timing,title:row.eventId?'Occupied venue':row.title,expiresAt:row.expiresAt});
  }
  const checkedAt=clock.now();
  return {items:items.filter(row=>effective(row,checkedAt)),conflictDetection:'server',checkedAt:checkedAt.toISOString(),policy:{allowTouching:config.allowTouching}};
}
module.exports={requestExtension,selectPrimaryVenue,create,decision,extend,replace,summary,search,availability,recheck,staffRecheck,conflictReport,recheckInTransaction,version,activeHold,contextFor,planning,needs,gaps,checkedNeeds,conflicts,effective,windowFor,venueRequirements,venueLock,eventLock,fail};
