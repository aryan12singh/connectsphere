// Entry point: loads config, then starts listening.
const config = require('./config');
const app = require('./app');

app.listen(config.port, () => {
  console.log(`event-service listening on port ${config.port}`);
});
