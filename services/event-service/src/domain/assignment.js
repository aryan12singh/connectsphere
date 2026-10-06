// Choosing the Coordinator for a request (CS-30, decision D3).
// Pure functions: the service loads the Coordinators and their load, calls
// pickCoordinator, then saves the result. No database access here.

/**
 * Does this request count towards its Coordinator's load?
 * Open responsibility only: Submitted, Returned for Amendment, or Approved with
 * the Event still in Planning or Confirmed.
 */
function countsAsActive({ requestStatus, eventStatus }) {
  if (requestStatus === 'SUBMITTED' || requestStatus === 'RETURNED_FOR_AMENDMENT') return true;
  if (requestStatus === 'APPROVED') {
    return eventStatus === 'ARRANGEMENT_PENDING' || eventStatus === 'CONFIRMED';
  }
  return false;
}

/**
 * @param coordinators  [{ id, createdAt }]  active users holding EVENT_COORDINATOR
 *                      (the list comes from user-service)
 * @param activeCounts  { [coordinatorId]: number }  their active requests; missing = 0
 * @returns the chosen Coordinator's id, or null when there is none
 *          (the request is then saved as "Awaiting assignment")
 *
 * Order: fewest active requests, then the most experienced (earliest
 * createdAt = longest-serving), then lowest id so the answer never varies.
 */
function pickCoordinator(coordinators, activeCounts = {}) {
  if (!Array.isArray(coordinators) || coordinators.length === 0) return null;
  const load = (c) => activeCounts[c.id] || 0;
  const sorted = [...coordinators].sort((x, y) => {
    if (load(x) !== load(y)) return load(x) - load(y);
    const t = new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime();
    if (t !== 0) return t;
    return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
  });
  return sorted[0].id;
}

module.exports = { pickCoordinator, countsAsActive };
