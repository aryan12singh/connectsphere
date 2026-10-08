const { occupiedWindow, occupiedWindowsOverlap } = require('./occupiedWindow');
const { holdIsExpired, holdWarningDue, validateHoldDeadline } = require('./holdClock');

function availabilityRange(query) {
  const errors = {};
  const startAt = query?.startAt;
  const endAt = query?.endAt;
  if (startAt !== undefined && Number.isNaN(Date.parse(startAt))) errors.startAt = ['Start time must be an ISO date-time'];
  if (endAt !== undefined && Number.isNaN(Date.parse(endAt))) errors.endAt = ['End time must be an ISO date-time'];
  if (startAt && endAt && !Number.isNaN(Date.parse(startAt)) && !Number.isNaN(Date.parse(endAt)) && Date.parse(startAt) >= Date.parse(endAt)) {
    errors.endAt = ['End time must be after start time'];
  }
  return errors;
}

function filterAvailability(bookings, query) {
  if (!query?.startAt || !query?.endAt) return bookings;
  const start = Date.parse(query.startAt);
  const end = Date.parse(query.endAt);
  return bookings.filter((booking) => Date.parse(booking.endAt) > start && Date.parse(booking.startAt) < end);
}

module.exports = { availabilityRange, filterAvailability, occupiedWindow, occupiedWindowsOverlap, holdIsExpired, holdWarningDue, validateHoldDeadline };
