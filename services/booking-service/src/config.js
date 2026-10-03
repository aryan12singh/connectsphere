require('dotenv').config();

const dataMode = process.env.DATA_MODE || 'prisma';
const databaseUrl = process.env.DATABASE_URL || '';
if (dataMode === 'prisma' && !databaseUrl) {
  throw new Error('Missing required environment variable: DATABASE_URL');
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  // Production uses the service-owned PostgreSQL database. Unit and contract
  // tests opt into DATA_MODE=memory explicitly so they remain deterministic.
  dataMode,
  databaseUrl,
  venueServiceUrl: process.env.VENUE_SERVICE_URL || 'http://localhost:3003',
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:3002',
  internalApiKey: process.env.INTERNAL_API_KEY || 'change-me-dev-internal-key',
  isTest: process.env.NODE_ENV === 'test',
};
