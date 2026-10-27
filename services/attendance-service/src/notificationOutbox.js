const path = require('node:path');
const utils = process.env.SERVICE_UTILS_PATH || path.resolve(__dirname, '../../utils');
const { startOutboxRelay } = require(path.join(utils, 'outbox-relay'));

function project(row) {
  if (!row?.id || row.kind !== 'RegistrationCreated' || !row.aggregateId || !row.payload) {
    throw Error('Invalid Attendance notification outbox row');
  }
  return { id: row.id, type: row.kind, aggregateType: 'Event', aggregateId: row.aggregateId, payload: row.payload };
}

function start({ env = process.env, relay = startOutboxRelay, prisma } = {}) {
  if (env.DATA_MODE !== 'prisma' || !env.RABBITMQ_URL) return null;
  const config = require(path.join(utils, 'domain-bus')).settings(env);
  return relay({
    prisma: prisma || require('./store').prismaClient(),
    connect: require('amqplib').connect,
    config,
    source: 'attendance',
    project,
  });
}

module.exports = { project, start };
