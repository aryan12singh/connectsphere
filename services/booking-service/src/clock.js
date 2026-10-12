// Injectable clock boundary for deterministic expiry tests. PostgreSQL writes
// take their clock_timestamp after acquiring all transaction locks instead.
module.exports = { now: () => new Date() };
