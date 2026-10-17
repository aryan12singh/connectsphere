const config = require('./config');
const app = require('./app');
const prisma = require('./db');

const server = app.listen(config.port, () => console.log(`equipment-service listening on port ${server.address().port}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(async () => {
    if (prisma) await prisma.$disconnect();
    process.exit(0);
  }));
}
