const config = require('./config');
const app = require('./app');

const server = app.listen(config.port, (error) => {
  if (error) {
    console.error('booking-service failed to listen:', error.code || error.message);
    process.exitCode = 1;
    return;
  }
  console.log(`booking-service listening on port ${server.address().port}`);
});

const relay=require('./notificationOutbox').start();
const holdNotices=require('./holdNotifications').start();
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{
  await holdNotices?.stop();
  await relay?.stop();
  process.exit(0);
});
