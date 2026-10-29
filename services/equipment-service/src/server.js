const config = require('./config');
const app = require('./app');
const prisma = require('./db');
const relay = require('./domainOutbox').start();

const server = app.listen(config.port, () => console.log(`equipment-service listening on port ${server.address().port}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(async () => {
    if (relay) await relay.stop();
    if (prisma) await prisma.$disconnect();
    process.exit(0);
  }));
}
