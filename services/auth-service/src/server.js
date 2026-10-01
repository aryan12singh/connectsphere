// Entry point: loads config, then starts listening.
const config = require('./config');
const app = require('./app');
const { syncKeycloakOnStartup } = require('./services/settings.service');

app.listen(config.port, () => {
  console.log(`auth-service listening on port ${config.port}`);
  // Make Keycloak's lockout and password rules match the saved admin
  // settings. Runs in the background; login works while it retries.
  syncKeycloakOnStartup();
});
