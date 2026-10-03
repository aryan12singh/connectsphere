const config = require('./config');
const app = require('./app');

app.listen(config.port, () => console.log(`booking-service listening on port ${config.port}`));
