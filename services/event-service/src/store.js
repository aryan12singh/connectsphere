// Store boundary mirrors booking-service's store.js. Keeping persistence
// behind this module lets unit tests use DATA_MODE=memory without a database.
module.exports = require('./repository');
