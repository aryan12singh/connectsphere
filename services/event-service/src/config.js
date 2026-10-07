// Reads environment variables once, in one place, and fails fast if a
// required one is missing — better than a confusing error at request time.
require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

module.exports = {
  authServiceUrl: required('AUTH_SERVICE_URL'),
  userServiceUrl: required('USER_SERVICE_URL'),
  port: Number(process.env.PORT || 3000),
  databaseUrl: required('DATABASE_URL'),
  // Shared secret that other services send in the `x-internal-api-key`
  // header. Only services inside the Docker network should know it.
  internalApiKey: required('INTERNAL_API_KEY'),
};
