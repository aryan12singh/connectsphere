// Coordinator workload (CS-30, decision D3), used by the Lead's queue and
// oversight counts. Week 7 retired automatic assignment: only the Lead assigns.
// Pure function; no database access here.

/**
 * Does this request count towards its Coordinator's load?
 * Open responsibility only: Submitted, Returned for Amendment, or Approved with
 * the Event still in Planning or Confirmed.
 */
function countsAsActive({ requestStatus, eventStatus }) {
  if (requestStatus === 'SUBMITTED' || requestStatus === 'RETURNED_FOR_AMENDMENT') return true;
  if (requestStatus === 'APPROVED') {
    return ['ARRANGEMENT_PENDING','CONFIRMED','PREPARATION','CANCELLING'].includes(eventStatus);
  }
  return false;
}

module.exports = { countsAsActive };
