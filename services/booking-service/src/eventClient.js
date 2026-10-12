const config = require('./config');

// Assignment belongs to event-service. Forward the verified caller token;
// this service never trusts a supplied coordinator ID or reads event_db.
async function canBookEvent(req, eventId) {
  if (!eventId) return false;
  const headers = { authorization: req.get('authorization') || '' };
  if (config.isTest) {
    headers['x-test-user-id'] = req.actor.id;
    headers['x-test-role'] = req.actor.role;
  }
  const response = await fetch(`${config.eventServiceUrl}/events/${encodeURIComponent(eventId)}/booking-access`, {
    headers, signal: AbortSignal.timeout(5000),
  });
  if (response.status === 403 || response.status === 404) return false;
  if (!response.ok) throw new Error('Event assignment service unavailable');
  const result = await response.json();
  if (!result || result.id !== eventId) throw new Error('Invalid event assignment response');
  return true;
}
async function planningContext(eventId) {
  let response;
  try { response = await fetch(`${config.eventServiceUrl}/internal/events/${encodeURIComponent(eventId)}/planning-context`, { headers:{'x-internal-api-key':config.internalApiKey},signal:AbortSignal.timeout(5000) }); }
  catch { throw Object.assign(new Error('Unable to check Event arrangements. Please retry.'),{status:503,code:'EVENT_UNAVAILABLE'}); }
  if (response.status === 404) throw Object.assign(new Error('Event not found'),{status:404,code:'EVENT_NOT_FOUND'});
  if (!response.ok) throw Object.assign(new Error('Unable to check Event arrangements. Please retry.'),{status:503,code:'EVENT_UNAVAILABLE'});
  const result = await response.json();
  if (result?.id !== eventId || !result.startAt || !result.endAt || !result.status || !result.currentCoordinatorId) throw Object.assign(new Error('Invalid Event planning response'),{status:503,code:'EVENT_UNAVAILABLE'});
  // Preserve Event's source fields in its own store. The booking projection
  // bridges the existing request form's labels to the catalogue's known codes;
  // unrecognised needs remain unmet instead of silently disappearing.
  const tags = {
    'wheelchair accessible entrance & seating':'WHEELCHAIR_ACCESS',
    'hearing loop / assisted listening':'HEARING_LOOP',
    'accessible restrooms nearby':'ACCESSIBLE_RESTROOMS',
    'no known accessibility needs':'NONE',
    'wheelchair_access':'WHEELCHAIR_ACCESS', 'hearing_loop':'HEARING_LOOP',
    'accessible_restrooms':'ACCESSIBLE_RESTROOMS', 'none':'NONE',
  };
  return { ...result,
    venueType:typeof result.venueType==='string'?result.venueType.trim().toUpperCase():result.venueType,
    preferredLayout:typeof result.preferredLayout==='string'?result.preferredLayout.trim().toUpperCase():result.preferredLayout,
    accessibilityNeeds:(result.accessibilityNeeds || []).map(value=>tags[value.trim().toLowerCase()] || value),
  };
}
module.exports = { canBookEvent, planningContext };
