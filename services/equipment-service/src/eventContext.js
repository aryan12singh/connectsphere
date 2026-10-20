const config = require('./config');

async function read(url, message = 'Current Event context is unavailable') {
  let response;
  try {
    response = await fetch(url, {
      headers: { 'x-internal-api-key': config.internalApiKey },
      signal: AbortSignal.timeout(5000),
    });
  }
  catch {
    throw Object.assign(new Error(message), { status: 503, code: 'EVENT_UNAVAILABLE' });
  }
  if (!response.ok) throw Object.assign(new Error(message), { status: response.status === 404 ? 404 : 503, code: 'EVENT_UNAVAILABLE' });
  return response.json();
}

async function requestContext(eventRequestId) {
  const value = await read(`${config.eventServiceUrl}/internal/requests/${encodeURIComponent(eventRequestId)}/technical-context`);
  if (!value.eventRequestId || !value.eventId || !value.requirementsRevision || !value.currentCoordinatorId) {
    throw Object.assign(new Error('Event technical context is incomplete'), { status: 503, code: 'EVENT_UNAVAILABLE' });
  }
  return value;
}

async function eventContext(eventId) {
  const value = await read(`${config.eventServiceUrl}/internal/events/${encodeURIComponent(eventId)}/planning-context`);
  if (value.id !== eventId || !value.technicalRequirementsRevision) {
    throw Object.assign(new Error('Event planning context is incomplete'), { status: 503, code: 'EVENT_UNAVAILABLE' });
  }
  return { ...value, eventId: value.id, requirementsRevision: value.technicalRequirementsRevision };
}

async function equipmentAllocationContext(eventId) {
  const value = await read(`${config.bookingServiceUrl}/internal/events/${encodeURIComponent(eventId)}/equipment-allocation-context`, 'Current venue allocation context is unavailable');
  if (value.eventId !== eventId || !Array.isArray(value.allocations) || !value.checkedAt) {
    throw Object.assign(new Error('Venue allocation context is incomplete'), { status: 503, code: 'BOOKING_UNAVAILABLE' });
  }
  return value;
}

module.exports = { requestContext, eventContext, equipmentAllocationContext };
