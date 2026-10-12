require('dotenv').config();

const dataMode = process.env.DATA_MODE || 'prisma';
const databaseUrl = process.env.DATABASE_URL || '';
const holdHours = Number(process.env.VENUE_HOLD_HOURS || 72);
if (!Number.isSafeInteger(holdHours) || holdHours <= 0 || holdHours > 8760) throw new Error('VENUE_HOLD_HOURS must be whole hours from 1 to 8760');
for (const key of ['VENUE_ALLOW_TOUCHING','VENUE_ALLOW_EXPIRY_AT_SETUP']) {
  if (process.env[key] !== undefined && !['true','false'].includes(process.env[key])) throw new Error(`${key} must be true or false`);
}
if (dataMode === 'prisma' && !databaseUrl) {
  throw new Error('Missing required environment variable: DATABASE_URL');
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  // Production uses the service-owned PostgreSQL database. Unit and contract
  // tests opt into DATA_MODE=memory explicitly so they remain deterministic.
  dataMode,
  databaseUrl,
  // Recorded discussion assumptions, pending CS-76 customer/PO confirmation.
  holdHours,
  allowTouching: process.env.VENUE_ALLOW_TOUCHING !== 'false',
  allowExpiryAtSetup: process.env.VENUE_ALLOW_EXPIRY_AT_SETUP !== 'false',
  eventServiceUrl: process.env.EVENT_SERVICE_URL || 'http://localhost:3003',
  venueServiceUrl: process.env.VENUE_SERVICE_URL || 'http://localhost:3005',
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:3002',
  internalApiKey: process.env.INTERNAL_API_KEY || 'change-me-dev-internal-key',
  isTest: process.env.NODE_ENV === 'test',
};
