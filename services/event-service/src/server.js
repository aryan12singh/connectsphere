// Entry point: loads config, then starts listening.
const config = require('./config');
const app = require('./app');

app.listen(config.port, () => {
  console.log(`event-service listening on port ${config.port}`);
});

const relay=require('./notificationOutbox').start();
const completion=require('./completion').start();
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{
  await relay?.stop();
  await completion?.stop();
  process.exit(0);
});
