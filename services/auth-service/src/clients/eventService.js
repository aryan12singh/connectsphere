// Calls event-service's internal API (assignment facts only).
const config = require('../config');

// Returns { coordinatorId, count, requests: [{ id, eventName, status }] }.
// Throws if event-service does not answer, so the caller can refuse safely.
async function openAssignments(coordinatorId) {
  const response = await fetch(`${config.eventServiceUrl}/internal/coordinators/${encodeURIComponent(coordinatorId)}/open-assignments`, {
    headers: { 'x-internal-api-key': config.internalApiKey },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`event-service open-assignments failed with ${response.status}`);
  return response.json();
}

module.exports = { openAssignments };
