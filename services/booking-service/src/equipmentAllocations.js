const { occupiedWindow } = require('./occupiedWindow');

function equipmentAllocations(bookings, venues, now) {
  const checkedAt = Date.parse(now);
  if (!Number.isFinite(checkedAt)) throw new RangeError('A valid check instant is required.');
  const venueById = new Map(venues.map(venue => [venue.id, venue]));
  return bookings
    .filter(booking => booking.status === 'CONFIRMED'
      || booking.status === 'TENTATIVELY_HELD' && Number.isFinite(Date.parse(booking.expiresAt)) && Date.parse(booking.expiresAt) > checkedAt)
    .map(booking => {
      const venue = venueById.get(booking.venueId);
      if (!venue) throw new RangeError(`Current venue configuration is unavailable for booking ${booking.id}.`);
      const occupied = occupiedWindow(booking, venue);
      return {
        bookingId: booking.id,
        venueId: booking.venueId,
        bookingVersion: booking.version,
        venueVersion: venue.version,
        status: booking.status,
        startAt: booking.startAt,
        endAt: booking.endAt,
        occupiedStartAt: occupied.startAt,
        occupiedEndAt: occupied.endAt,
        flags: booking.flags || [],
      };
    });
}

module.exports = { equipmentAllocations };
