const CONFIRMED = 'CONFIRMED';

const ATTENDEE_PRIVATE_FIELDS = [
  'internalNotes',
  'planningData',
  'equipmentPlanning',
  'safetyReviews',
  'safetyNotes',
  'historicalArrangements',
  'otherUserRegistrations',
  'venueBookings',
];

function isEventVisible(status) {
  return status === CONFIRMED;
}

function filterAttendeeFields(event) {
  const filtered = { ...event };
  for (const field of ATTENDEE_PRIVATE_FIELDS) {
    delete filtered[field];
  }
  return filtered;
}

function filterOrganiserFields(event) {
  return { ...event };
}

module.exports = {
  CONFIRMED,
  isEventVisible,
  filterAttendeeFields,
  filterOrganiserFields,
};
