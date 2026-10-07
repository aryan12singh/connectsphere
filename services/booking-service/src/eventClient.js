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
module.exports = { canBookEvent };
