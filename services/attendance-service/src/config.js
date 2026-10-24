require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT || 3000),
  dataMode: process.env.DATA_MODE || 'prisma',
  databaseUrl: process.env.DATABASE_URL || '',
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:3002',
  eventServiceUrl: process.env.EVENT_SERVICE_URL || 'http://localhost:3003',
  bookingServiceUrl: process.env.BOOKING_SERVICE_URL || 'http://booking-service:3000',
  venueServiceUrl: process.env.VENUE_SERVICE_URL || 'http://localhost:3005',
  internalApiKey: process.env.INTERNAL_API_KEY || 'change-me-dev-internal-key',
  isTest: process.env.NODE_ENV === 'test',
};
