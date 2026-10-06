// The ONE place that turns a stored status into the words people see (CS-32).
// Every screen and API response takes its label from here, so "Under Review"
// can never be spelled two ways. The frontend should import/mirror this map
// rather than keeping its own.

// Statuses of the EventRequest (the Organiser's request).
const REQUEST_LABELS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Under Review',
  RETURNED_FOR_AMENDMENT: 'Returned for Amendment',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

// Statuses of the Event (created when a request is approved).
const EVENT_LABELS = {
  ARRANGEMENT_PENDING: 'Planning',
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
};

/**
 * The single label to show for a request + its (optional) event.
 * Once an Event exists its status wins, so an approved request reads
 * "Planning" and is never shown as "Confirmed" until CS-31 confirms it.
 */
function displayStatus({ requestStatus, eventStatus }) {
  if (eventStatus) return EVENT_LABELS[eventStatus];
  return REQUEST_LABELS[requestStatus];
}

module.exports = { REQUEST_LABELS, EVENT_LABELS, displayStatus };
