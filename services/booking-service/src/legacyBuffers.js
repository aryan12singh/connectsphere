const store=require('./store');
const {planningContext}=require('./eventClient');
const {venueContext}=require('./venueClient');
const workflows=require('./workflows');
const config=require('./config');

function error(status,code,message){throw Object.assign(new Error(message),{status,code});}
async function callVenue(venueId,path,body){
  let response,result;
  try {response=await fetch(`${config.venueServiceUrl}/internal/venues/${encodeURIComponent(venueId)}/${path}`,{method:'PUT',headers:{'content-type':'application/json','x-internal-api-key':config.internalApiKey},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});result=await response.json();}
  catch {error(503,'VENUE_UNAVAILABLE','Configuration acknowledgement unavailable. Reload before retrying');}
  if(!response.ok)error(response.status,result.error?.code || 'VENUE_UNAVAILABLE',result.error?.message || 'Unable to configure venue buffers');
  return result;
}
async function context(venueId,tx,at){
  const venue=await venueContext(venueId);
  if(!venue.legacyBufferConfigurationPending)error(409,'LEGACY_CONFIGURATION_CLOSED','Initial coordinated configuration is not available for this venue');
  const rows=(await store.listBookings(tx,{venueId})).filter(row=>['TENTATIVELY_HELD','CONFIRMED'].includes(row.status) && workflows.effective(row,at) && Date.parse(workflows.windowFor(row,venue).endAt)>=at.getTime());
  if(rows.some(row=>!row.eventId))error(503,'EVENT_UNAVAILABLE','An existing commitment has no Event contact. Reconcile its Event before configuration');
  const events=[];
  for(const eventId of [...new Set(rows.map(row=>row.eventId))].sort()){
    const event=await planningContext(eventId);
    if(typeof event.organiserId!=='string' || !event.organiserId.trim())error(503,'EVENT_UNAVAILABLE','Current Coordinator and Organiser contacts are required before configuration');
    events.push({eventId,title:event.title || 'Event',coordinatorId:event.currentCoordinatorId,organiserId:event.organiserId,bookings:rows.filter(row=>row.eventId===eventId).map(row=>({id:row.id,version:row.version})).sort((a,b)=>a.id.localeCompare(b.id))});
  }
  return {venueId,version:venue.version,affectedEvents:events};
}
async function preview(venueId){return store.withLocks([workflows.venueLock(venueId)],(tx,at)=>context(venueId,tx,at));}
async function configure(venueId,body){
  return store.withLocks([workflows.venueLock(venueId)],async(tx,at)=>{
    const current=await context(venueId,tx,at);
    if(body.version!==current.version)error(409,'STALE_VENUE','Venue changed. Reload the communication checklist');
    if(!Array.isArray(body.communications) || body.communications.length!==current.affectedEvents.length)error(409,'STALE_COMMUNICATION','Record communication for every current affected Event');
    const communications=current.affectedEvents.map(event=>{
      const matches=body.communications.filter(item=>item?.eventId===event.eventId),entry=matches[0];
      if(matches.length!==1 || entry.coordinatorId!==event.coordinatorId || entry.organiserId!==event.organiserId || store.fingerprint(entry.bookings)!==store.fingerprint(event.bookings))error(409,'STALE_COMMUNICATION','Affected bookings or Event contacts changed. Reload and communicate with the current contacts');
      if(entry.staffInformedCoordinator!==true || entry.coordinatorInformedOrganiser!==true || typeof entry.note!=='string' || !entry.note.trim() || entry.note.trim().length>1000)error(422,'COMMUNICATION_REQUIRED','Record Staff-to-Coordinator and Coordinator-to-Organiser communication with a note for every Event');
      return {...event,staffInformedCoordinator:true,coordinatorInformedOrganiser:true,note:entry.note.trim()};
    });
    const retainLock=await confirmedAtVenue(venueId,tx);
    const result=await callVenue(venueId,'legacy-buffers',{...body,communications,retainLock});
    if(result.id!==venueId || result.version!==body.version+1 || result.legacyBufferConfigurationPending!==false || (retainLock?!result.buffersLockedAt:result.buffersLockedAt!==null))error(503,'VENUE_UNAVAILABLE','Invalid configuration acknowledgement. Reload before retrying');
    return result;
  });
}
async function confirmedAtVenue(venueId,tx){
  const rows=await store.listBookings(tx,{venueId}),history=await store.listHistory(venueId);
  return rows.some(row=>row.status==='CONFIRMED') || history.some(entry=>entry.changes?.before?.venueId===venueId && entry.changes.before.status==='CONFIRMED' || entry.changes?.after?.venueId===venueId && entry.changes.after.status==='CONFIRMED' || !entry.changes?.before && !entry.changes?.after && [entry.fromStatus,entry.toStatus].includes('CONFIRMED'));
}
async function bufferStatus(venueId){return store.withLocks([workflows.venueLock(venueId)],async tx=>{const venue=await venueContext(venueId);return {venueId,version:venue.version,everConfirmed:await confirmedAtVenue(venueId,tx)};});}
async function recoverFence(venueId,body){
  return store.withLocks([workflows.venueLock(venueId)],async tx=>{
    const venue=await venueContext(venueId);
    if(venue.version!==body.input.version)error(409,'STALE_VENUE','Venue changed. Reload before editing');
    const confirmed=await confirmedAtVenue(venueId,tx);
    if(confirmed || venue.legacyBufferConfigurationPending)error(409,'VENUE_BUFFERS_LOCKED','Buffers are locked after the first confirmed booking; use coordinated initial configuration only where available');
    const result=await callVenue(venueId,'buffer-fence-recovery',body);
    if(result.id!==venueId || result.version!==venue.version+1 || result.buffersLockedAt!==null)error(503,'VENUE_UNAVAILABLE','Invalid recovery acknowledgement. Reload before retrying');
    return result;
  });
}
module.exports={preview,configure,recoverFence,bufferStatus};
