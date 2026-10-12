require('dotenv').config();

const dataMode = process.env.DATA_MODE || 'prisma';
const databaseUrl = process.env.DATABASE_URL || '';
const maxVenueCapacity = Number(process.env.MAX_VENUE_CAPACITY || 10000);
// Discussion proposal, configurable until the customer/PO confirms the cap.
const maxBufferMinutes = Number(process.env.MAX_VENUE_BUFFER_MINUTES || 480);
const recheckPollMs=Number(process.env.RECHECK_POLL_MS || 5000);
if (!Number.isSafeInteger(recheckPollMs) || recheckPollMs<1 || recheckPollMs>60000) throw new Error('RECHECK_POLL_MS must be whole milliseconds from 1 to 60000');
if (!Number.isSafeInteger(maxBufferMinutes) || maxBufferMinutes < 0 || maxBufferMinutes > 2147483647) {
  throw new Error('MAX_VENUE_BUFFER_MINUTES must be a non-negative PostgreSQL integer');
}
if (dataMode === 'prisma' && !databaseUrl) {
  throw new Error('Missing required environment variable: DATABASE_URL');
}
if (!Number.isInteger(maxVenueCapacity) || maxVenueCapacity <= 0) {
  throw new Error('MAX_VENUE_CAPACITY must be a positive integer');
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  // Production uses the service-owned PostgreSQL database. Unit and contract
  // tests opt into DATA_MODE=memory explicitly so they remain deterministic.
  dataMode,
  databaseUrl,
  maxVenueCapacity,
  maxBufferMinutes,
  recheckPollMs,
  bookingServiceUrl: process.env.BOOKING_SERVICE_URL || 'http://localhost:3006',
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:3002',
  internalApiKey: process.env.INTERNAL_API_KEY || 'change-me-dev-internal-key',
  isTest: process.env.NODE_ENV === 'test',
};
