const store = require('./store');

function instant(value, nullable = false) {
  if (value == null && nullable) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value);
}

function confirmedEvent(message) {
  if (!message || message.type !== 'EventConfirmed') return null;
  const payload = message.payload;
  if (!message.id || typeof message.id !== 'string' || !payload || typeof payload !== 'object') {
    throw Error('Invalid EventConfirmed envelope');
  }
  const startAt = instant(payload.startAt), endAt = instant(payload.endAt);
  const opensAt = instant(payload.registrationOpensAt, true), closesAt = instant(payload.registrationClosesAt, true);
  if (
    typeof payload.eventId !== 'string' || !payload.eventId ||
    (message.aggregateId && message.aggregateId !== payload.eventId) ||
    !Number.isSafeInteger(payload.eventVersion) || payload.eventVersion < 1 ||
    payload.status !== 'CONFIRMED' || typeof payload.title !== 'string' || !payload.title.trim() ||
    (payload.description != null && typeof payload.description !== 'string') ||
    !startAt || !endAt || startAt >= endAt || typeof payload.timeZone !== 'string' || !payload.timeZone ||
    typeof payload.organiserId !== 'string' || !payload.organiserId || typeof payload.registrationEnabled !== 'boolean' ||
    opensAt === null && payload.registrationOpensAt != null || closesAt === null && payload.registrationClosesAt != null
  ) throw Error('Invalid EventConfirmed payload');

  return {
    id: payload.eventId,
    eventId: payload.eventId,
    title: payload.title,
    description: payload.description ?? '',
    status: 'CONFIRMED',
    eventVersion: payload.eventVersion,
    startAt,
    endAt,
    timeZone: payload.timeZone,
    organiserId: payload.organiserId,
    registrationEnabled: payload.registrationEnabled,
    registrationWindow: opensAt || closesAt ? {
      startAt: opensAt?.toISOString() || null,
      endAt: closesAt?.toISOString() || null,
    } : null,
  };
}

async function deliver(message, targetStore = store) {
  const event = confirmedEvent(message);
  if (!event) return { result: 'ignored' };
  await targetStore.upsertConfirmedEvent(event);
  return { result: 'processed' };
}

module.exports = { confirmedEvent, deliver };
