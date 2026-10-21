const config = require('./config');
const app = require('./app');
const server = app.listen(config.port, () => console.log(`attendance-service listening on port ${server.address().port}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
