// Entry point: loads config, then starts listening.
const config = require('./config');
const app = require('./app');

app.listen(config.port, () => {
  console.log(`venue-service listening on port ${config.port}`);
});
