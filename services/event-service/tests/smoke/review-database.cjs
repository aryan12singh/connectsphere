// Guard the only smoke check that temporarily changes shared role grants.
const assert = require('node:assert/strict');
function reviewAuthDatabase(config, project, connectionString) {
  assert.match(project || '', /^csreview-aryan-[a-z0-9-]+$/, 'Use an isolated Aryan review project');
  assert.equal(config.name, project, 'Compose project must match the smoke fixture');
  const url = new URL(connectionString);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'Use a PostgreSQL fixture');
  assert.ok(['127.0.0.1', 'localhost', 'host.docker.internal'].includes(url.hostname), 'Only the recorded local fixture may be changed');
  assert.equal(url.pathname, '/auth_db', 'Permission fixture must use auth_db');
  assert.ok(config.services?.postgres?.ports?.some(port => port.host_ip === '127.0.0.1' && Number(port.target) === 5432 && String(port.published) === (url.port || '5432')), 'Auth database port must match the loopback Compose mapping');
  return url;
}
module.exports = { reviewAuthDatabase };
