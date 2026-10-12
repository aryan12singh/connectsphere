const config = require('./config');
const app = require('./app');
const stopRechecks=require('./rechecks').start();

const server = app.listen(config.port, (error) => {
  if (error) {
    console.error('venue-service failed to listen:', error.code || error.message);
    process.exitCode = 1;
    return;
  }
  console.log(`venue-service listening on port ${server.address().port}`);
});
process.on('SIGTERM',()=>{stopRechecks();server.close(()=>process.exit(0));});
