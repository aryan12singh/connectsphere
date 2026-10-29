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

async function cancellationProof(eventId, cancellationActionId) {
  if (typeof cancellationActionId !== 'string' || !cancellationActionId.trim()) {
    throw Object.assign(new Error('The committed cancellation action ID is required.'), { status: 422, code: 'CANCELLATION_ACTION_REQUIRED' });
  }
  let response;
  try {
    response = await fetch(`${config.eventServiceUrl}/internal/events/${encodeURIComponent(eventId)}/cancellation-context?actionId=${encodeURIComponent(cancellationActionId)}`, {
      headers: { 'x-internal-api-key': config.internalApiKey },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw Object.assign(new Error('Committed Event cancellation proof is unavailable.'), { status: 503, code: 'CANCELLATION_PROOF_UNAVAILABLE' });
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const status = [404, 409, 422].includes(response.status) ? response.status : 503;
    throw Object.assign(new Error(payload?.error?.message || 'Committed Event cancellation proof is unavailable.'), {
      status,
      code: payload?.error?.code || (status === 503 ? 'CANCELLATION_PROOF_UNAVAILABLE' : 'CANCELLATION_NOT_COMMITTED'),
    });
  }
  const value = await response.json();
  if (value.eventId !== eventId || value.cancellationActionId !== cancellationActionId
    || value.proofType !== 'ACCEPTED_INTENT' || !['CANCELLING', 'CANCELLED'].includes(value.phase)) {
    throw Object.assign(new Error('The supplied cancellation action is not a committed Event cancellation.'), { status: 409, code: 'CANCELLATION_NOT_COMMITTED' });
  }
  return value;
}

module.exports = { requestContext, eventContext, equipmentAllocationContext, cancellationProof };
