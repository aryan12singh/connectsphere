const config = require('./config');
const app = require('./app');

const server = app.listen(config.port, (error) => {
  if (error) {
    console.error('notification-service failed to listen:', error.code || error.message);
    process.exitCode = 1;
    return;
  }
  console.log(`notification-service listening on port ${server.address().port}`);
});

const consumer=require('./consumer').start();
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{
 await consumer?.stop();
 server.close(()=>process.exit(0));
});
