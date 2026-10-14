const config = require('./config');
async function venueContext(venueId) {
  let response;
  try {
    response = await fetch(`${config.venueServiceUrl}/venues/${encodeURIComponent(venueId)}/internal`, { headers:{'x-internal-api-key':config.internalApiKey}, signal:AbortSignal.timeout(5000) });
  } catch { throw Object.assign(new Error('Unable to check venue. Please retry.'),{status:503,code:'VENUE_UNAVAILABLE'}); }
  if (response.status === 404) throw Object.assign(new Error('Venue not found'),{status:404,code:'VENUE_NOT_FOUND'});
  if (!response.ok) throw Object.assign(new Error('Unable to check venue. Please retry.'),{status:503,code:'VENUE_UNAVAILABLE'});
  const value = await response.json();
  if (value?.id !== venueId || !Number.isInteger(value.version) || value.version < 1 || !Number.isSafeInteger(value.setupMinutes) || value.setupMinutes < 0 || !Number.isSafeInteger(value.turnaroundMinutes) || value.turnaroundMinutes < 0) throw Object.assign(new Error('Invalid venue planning response'),{status:503,code:'VENUE_UNAVAILABLE'});
  return value;
}
async function catalogue() {
  let response;
  try { response=await fetch(`${config.venueServiceUrl}/venues/internal/catalogue`,{headers:{'x-internal-api-key':config.internalApiKey},signal:AbortSignal.timeout(5000)}); }
  catch { throw Object.assign(new Error('Unable to search venues. Please retry.'),{status:503,code:'VENUE_UNAVAILABLE'}); }
  if (!response.ok) throw Object.assign(new Error('Unable to search venues. Please retry.'),{status:503,code:'VENUE_UNAVAILABLE'});
  const body=await response.json();
  if (!Array.isArray(body?.items)) throw Object.assign(new Error('Invalid venue catalogue response'),{status:503,code:'VENUE_UNAVAILABLE'});
  return body.items;
}
async function removeVenue(venueId,version) {
  const response=await fetch(`${config.venueServiceUrl}/internal/venues/${encodeURIComponent(venueId)}`,{method:'DELETE',headers:{'content-type':'application/json','x-internal-api-key':config.internalApiKey},body:JSON.stringify({version}),signal:AbortSignal.timeout(5000)});
  if (response.status===404) return false;
  if (response.status===409) throw Object.assign(new Error('Venue settings changed during deletion. Refresh and retry.'),{status:409,code:'STALE_VENUE'});
  if (response.status!==204) throw Object.assign(new Error('Unable to remove venue. Please retry.'),{status:503,code:'VENUE_UNAVAILABLE'});
  return true;
}
async function lockVenueBuffers(venue,actor) {
  let response;
  try {response=await fetch(`${config.venueServiceUrl}/internal/venues/${encodeURIComponent(venue.id)}/buffer-lock`,{method:'POST',headers:{'content-type':'application/json','x-internal-api-key':config.internalApiKey},body:JSON.stringify({version:venue.version,actor:{id:actor.id,role:actor.role}}),signal:AbortSignal.timeout(5000)});}
  catch {throw Object.assign(new Error('Unable to establish the venue buffer lock. Refresh and retry approval.'),{status:503,code:'VENUE_UNAVAILABLE'});}
  if(response.status===409)throw Object.assign(new Error('Venue changed before confirmation. Refresh and retry.'),{status:409,code:'STALE_VENUE'});
  if(!response.ok)throw Object.assign(new Error('Unable to establish the venue buffer lock.'),{status:503,code:'VENUE_UNAVAILABLE'});
  const saved=await response.json();
  if(saved.id!==venue.id || !saved.buffersLockedAt || !Number.isFinite(Date.parse(saved.buffersLockedAt)) || !Number.isSafeInteger(saved.version) || saved.version<venue.version || saved.setupMinutes!==venue.setupMinutes || saved.turnaroundMinutes!==venue.turnaroundMinutes)throw Object.assign(new Error('Invalid venue buffer-lock acknowledgement'),{status:503,code:'VENUE_UNAVAILABLE'});
  return saved;
}
module.exports = { venueContext,catalogue,removeVenue,lockVenueBuffers };
