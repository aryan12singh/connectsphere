const utils = process.env.SERVICE_UTILS_PATH || '../../utils';
const { startOutboxRelay } = require(`${utils}/outbox-relay`);
const { settings } = require(`${utils}/domain-bus`);

function project(row) {
  if (!row?.id || row.eventType !== 'EquipmentReleased' || !row.payload?.eventId || !row.payload?.cancellationActionId) {
    throw Error('Invalid EquipmentReleased outbox action');
  }
  return {
    id: row.id,
    type: row.eventType,
    aggregateType: 'Event',
    aggregateId: row.payload.eventId,
    payload: row.payload,
  };
}

function start({ env = process.env, relay = startOutboxRelay, prisma } = {}) {
  if (env.DATA_MODE !== 'prisma' || !env.RABBITMQ_URL) return null;
  return relay({
    prisma: prisma || require('./db'),
    connect: require('amqplib').connect,
    config: settings(env),
    source: 'equipment',
    project,
  });
}

module.exports = { project, start };
