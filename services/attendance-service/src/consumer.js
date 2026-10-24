const path = require('node:path');
const utils = process.env.SERVICE_UTILS_PATH || path.resolve(__dirname, '../../utils');
const { settings, startConsumer } = require(path.join(utils, 'domain-bus'));
const { deliver: deliverEventConfirmed } = require('./eventConfirmed');

function start({ env = process.env, startConsumer: run = startConsumer, connect, deliver = deliverEventConfirmed } = {}) {
  if (env.DATA_MODE !== 'prisma' || !env.RABBITMQ_URL) return null;
  const config = {
    ...settings(env),
    queue: env.RABBITMQ_QUEUE || 'attendance-service.domain-events',
  };
  return run({
    connect: connect || require('amqplib').connect,
    config,
    deliver,
  });
}

module.exports = { start };
