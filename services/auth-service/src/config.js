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
  port: Number(process.env.PORT || 3000),
  databaseUrl: required('DATABASE_URL'),

  // Keycloak — only used to check passwords.
  keycloak: {
    url: required('KEYCLOAK_URL'), // e.g. http://keycloak:8080
    realm: required('KEYCLOAK_REALM'), // e.g. connectsphere
    clientId: required('KEYCLOAK_CLIENT_ID'), // e.g. auth-service
    clientSecret: required('KEYCLOAK_CLIENT_SECRET'),
  },

  // Where to find user-service inside the Docker network.
  userServiceUrl: required('USER_SERVICE_URL'), // e.g. http://user-service:3000

  // Shared secret for service-to-service calls (see middleware/internalOnly.js).
  internalApiKey: required('INTERNAL_API_KEY'),

  // Session length, idle timeout, lockout and password rules are NOT here:
  // tech support changes them at runtime (auth_db.auth_settings, /admin/settings).
};
