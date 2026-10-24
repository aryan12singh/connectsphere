const config = require('./config');

async function planningContext(eventId) {
  if (config.dataMode !== 'prisma' && config.isTest) {
    const event = await require('./store').findEvent(eventId);
    return event ? {
      id: event.eventId,
      status: event.status,
      organiserId: event.organiserId,
      currentCoordinatorId: event.currentCoordinatorId || null,
      expectedAttendance: event.expectedAttendance ?? null,
    } : null;
  }
  let response;
  try {
    response = await fetch(`${config.eventServiceUrl}/internal/events/${encodeURIComponent(eventId)}/planning-context`, {
      headers: { 'x-internal-api-key': config.internalApiKey },
      signal: AbortSignal.timeout(5000),
    });
  }
  catch {
    throw Object.assign(new Error('Unable to verify current Event assignment.'), { status: 503, code: 'EVENT_UNAVAILABLE' });
  }
  if (response.status === 404) return null;
  if (!response.ok) throw Object.assign(new Error('Unable to verify current Event assignment.'), { status: 503, code: 'EVENT_UNAVAILABLE' });
  const value = await response.json();
  if (value.id !== eventId || !value.currentCoordinatorId && value.currentCoordinatorId !== null) {
    throw Object.assign(new Error('Unable to verify current Event assignment.'), { status: 503, code: 'EVENT_UNAVAILABLE' });
  }
  return value;
}

module.exports = { planningContext };
