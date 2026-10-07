// Asks venue-service about a venue (service-to-service, internal key).
// Used so a booking can only point at a real venue that is accepting
// bookings. Venue Staff mark a venue Inactive on the venue form; that status
// is what coordinators see and what blocks new bookings.
const config = require('./config');

class VenueServiceUnavailable extends Error {}

/** Returns the venue, or null if it does not exist. Throws if unreachable. */
async function getVenue(venueId) {
  let response;
  try {
    response = await fetch(`${config.venueServiceUrl}/venues/${encodeURIComponent(venueId)}/internal`, {
      headers: { 'x-internal-api-key': config.internalApiKey },
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    throw new VenueServiceUnavailable(error.message);
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new VenueServiceUnavailable(`venue-service returned ${response.status}`);
  return response.json();
}

module.exports = { getVenue, VenueServiceUnavailable };
