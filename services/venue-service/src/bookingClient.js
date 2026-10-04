const config = require('./config');

async function blockingBookingCount(venueId) {
  const response = await fetch(`${config.bookingServiceUrl}/internal/venue-links/${encodeURIComponent(venueId)}?blockingOnly=true`, {
    headers: { 'x-internal-api-key': config.internalApiKey },
  });
  if (!response.ok) throw new Error(`Booking service returned ${response.status}`);
  const result = await response.json();
  if (!Number.isInteger(result.blockingCount) || result.blockingCount < 0) throw new Error('Booking service returned an invalid blocking count');
  return result.blockingCount;
}

module.exports = { blockingBookingCount };
