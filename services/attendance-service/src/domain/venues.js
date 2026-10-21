const APPROVED = 'APPROVED';
const CONFIRMED = 'CONFIRMED';

function getPrimaryVenue(venues, designatedPrimaryId) {
  if (!Array.isArray(venues) || venues.length === 0) return null;
  if (designatedPrimaryId) {
    const primary = venues.find(v => v.id === designatedPrimaryId);
    if (primary) return primary;
  }
  return venues[0];
}

function getEffectiveVenues(bookings) {
  if (!Array.isArray(bookings)) return [];
  return bookings
    .filter(b => b.status === CONFIRMED && b.approved === true)
    .map(b => ({ id: b.venueId, name: b.venueName || 'Venue', startAt: b.startAt, endAt: b.endAt }));
}

function excludeObsoleteBookings(bookings) {
  if (!Array.isArray(bookings)) return [];
  return bookings.filter(b =>
    b.status === CONFIRMED &&
    b.approved === true &&
    b.replacedBy === undefined &&
    b.rejected === undefined &&
    b.expired === undefined &&
    b.pending !== true,
  );
}

module.exports = {
  APPROVED,
  CONFIRMED,
  getPrimaryVenue,
  getEffectiveVenues,
  excludeObsoleteBookings,
};
