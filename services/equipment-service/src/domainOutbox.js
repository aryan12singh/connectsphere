const utils = process.env.SERVICE_UTILS_PATH || '../../utils';
const { startOutboxRelay } = require(`${utils}/outbox-relay`);
const { settings } = require(`${utils}/domain-bus`);

// CS-51 AC3/AC4: technical requests, decisions, reservations and equipment
// flags notify the people on the Event. Other rows (for example "not
// required" declarations) have no notice and are suppressed by the relay.
const NOTIFIED = ['TechRequestSubmitted', 'TechRequestDecided', 'EquipmentReserved', 'EquipmentUnavailable'];

function project(row) {
  if (NOTIFIED.includes(row?.eventType)) {
    if (!row.id || !row.payload?.eventRequestId) throw Error(`Invalid ${row.eventType} outbox action`);
    return { id: row.id, type: row.eventType, aggregateType: 'TechnicalRequest', aggregateId: row.payload.eventRequestId, payload: row.payload };
  }
  if (row?.eventType !== 'EquipmentReleased') return null;
  if (!row.id || !row.payload?.eventId || !row.payload?.cancellationActionId) {
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

module.exports = { project, start, NOTIFIED };
