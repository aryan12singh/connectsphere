// Reads environment variables once, in one place, and fails fast if a
// required one is missing — better than a confusing error at request time.
require('dotenv').config();

module.exports = {
  authServiceUrl: required('AUTH_SERVICE_URL'),
  userServiceUrl: required('USER_SERVICE_URL'),
  port: Number(process.env.PORT || 3000),
  dataMode: process.env.DATA_MODE || 'prisma',
  databaseUrl: process.env.DATABASE_URL || '',
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:3002',
  userServiceUrl: process.env.USER_SERVICE_URL || 'http://localhost:3004',
  // Shared secret that other services send in the `x-internal-api-key`
  // header. Production compose supplies this; the development fallback keeps
  // isolated unit tests and local starts deterministic.
  internalApiKey: process.env.INTERNAL_API_KEY || 'change-me-dev-internal-key',
  isTest: process.env.NODE_ENV === 'test',
};
