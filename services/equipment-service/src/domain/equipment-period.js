function equipmentPeriod(bookings) {
  if (!Array.isArray(bookings) || bookings.length === 0) throw new RangeError('At least one current venue booking is required.');
  const windows = bookings.map((booking) => {
    if (typeof booking?.bookingId !== 'string' || !booking.bookingId.trim()) throw new TypeError('Every equipment allocation needs a booking ID.');
    const start = Date.parse(booking.occupiedStartAt);
    const end = Date.parse(booking.occupiedEndAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new RangeError('Every venue booking needs a valid occupied window.');
    return { start, end };
  });
  return {
    startAt: new Date(Math.min(...windows.map(window => window.start))).toISOString(),
    endAt: new Date(Math.max(...windows.map(window => window.end))).toISOString(),
  };
}

module.exports = { equipmentPeriod };
