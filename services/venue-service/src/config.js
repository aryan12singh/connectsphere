require('dotenv').config();

const dataMode = process.env.DATA_MODE || 'prisma';
const databaseUrl = process.env.DATABASE_URL || '';
const maxVenueCapacity = Number(process.env.MAX_VENUE_CAPACITY || 10000);
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
  bookingServiceUrl: process.env.BOOKING_SERVICE_URL || 'http://localhost:3005',
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:3002',
  internalApiKey: process.env.INTERNAL_API_KEY || 'change-me-dev-internal-key',
  isTest: process.env.NODE_ENV === 'test',
};
