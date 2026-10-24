const config = require('./config');
const app = require('./app');
const { start } = require('./consumer');
const consumer = start();
const notificationOutbox = require('./notificationOutbox').start();
const outboxHealth = config.dataMode === 'prisma' ? require('./outboxHealth').start({ prisma: require('./store').prismaClient() }) : null;
const server = app.listen(config.port, () => console.log(`attendance-service listening on port ${server.address().port}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(async () => {
    await consumer?.stop();
    await notificationOutbox?.stop();
    await outboxHealth?.stop();
    process.exit(0);
  }));
}
