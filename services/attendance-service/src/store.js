const config = require('./config');
const { randomUUID } = require('node:crypto');
const { placesRemaining } = require('./domain/registration');

let prisma = null;
if (config.dataMode === 'prisma') {
  if (!config.databaseUrl) throw new Error('Missing required environment variable: DATABASE_URL');
  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg } = require('@prisma/adapter-pg');
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
}

const memory = { events: new Map(), registrations: new Map(), outbox: [] };

function ruleError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function confirmedCountFromRows(rows, eventId) {
  return rows.filter(row => row.eventId === eventId && row.status === 'CONFIRMED').length;
}

function eventView(event) {
  return {
    id: event.id,
    eventId: event.eventId,
    title: event.title,
    description: event.description,
    status: event.status,
    eventVersion: event.eventVersion ?? 0,
    startAt: event.startAt,
    endAt: event.endAt,
    timeZone: event.timeZone,
    primaryVenueId: event.primaryVenueId,
    primaryVenueName: event.primaryVenueName,
    registrationLimit: event.registrationLimit,
    registrationEnabled: event.registrationEnabled ?? false,
    registrationWindow: event.registrationWindow,
    withdrawalEnabled: event.withdrawalEnabled ?? false,
    withdrawalCutoffAt: event.withdrawalCutoffAt ?? null,
    allowReregistration: event.allowReregistration ?? false,
    venues: event.venues?.map(venue=>Object.fromEntries(['id','bookingId','name','startAt','endAt'].filter(key=>venue[key]!==undefined).map(key=>[key,venue[key]]))),
    organiserId: event.organiserId,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

async function listEvents() {
  if (config.dataMode !== 'prisma') return [...memory.events.values()].filter(e => e.status === 'CONFIRMED');
  return prisma.event.findMany({ where: { status: 'CONFIRMED' } });
}

async function findEvent(eventId) {
  if (config.dataMode !== 'prisma') return memory.events.get(eventId) || null;
  return prisma.event.findUnique({ where: { eventId } });
}

async function saveEvent(event) {
  if (config.dataMode !== 'prisma') {
    memory.events.set(event.id, event);
    return eventView(event);
  }
  const record = await prisma.event.create({ data: event });
  return eventView(record);
}

async function upsertConfirmedEvent(event) {
  const data = {
    eventId: event.eventId,
    title: event.title,
    description: event.description ?? '',
    status: 'CONFIRMED',
    eventVersion: event.eventVersion,
    startAt: new Date(event.startAt),
    endAt: new Date(event.endAt),
    timeZone: event.timeZone,
    organiserId: event.organiserId,
    registrationEnabled: event.registrationEnabled,
    registrationWindow: event.registrationWindow == null ? null : JSON.stringify(event.registrationWindow),
  };

  if (!prisma) {
    const currentEntry = [...memory.events.entries()].find(([, row]) => row.eventId === event.eventId);
    const current = memory.events.get(event.eventId) || currentEntry?.[1];
    if (!current || event.eventVersion > (current.eventVersion ?? 0)) {
      const next = {
        ...current,
        id: current?.id || event.eventId,
        ...data,
        registrationWindow: event.registrationWindow ?? null,
        primaryVenueId: current?.primaryVenueId ?? null,
        primaryVenueName: current?.primaryVenueName ?? null,
        registrationLimit: current?.registrationLimit ?? null,
        createdAt: current?.createdAt || new Date(),
        updatedAt: new Date(),
      };
      for (const [key, row] of memory.events) {
        if (row.eventId === event.eventId && key !== event.eventId) memory.events.delete(key);
      }
      memory.events.set(event.eventId, next);
      return eventView(next);
    }
    return eventView(current);
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO "events" ("id","eventId","title","description","status","eventVersion","startAt","endAt","timeZone","organiserId","registrationEnabled","registrationWindow","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,'CONFIRMED',$5,$6,$7,$8,$9,$10,$11::jsonb,now(),now())
     ON CONFLICT ("eventId") DO UPDATE SET
       "title"=EXCLUDED."title",
       "description"=EXCLUDED."description",
       "status"=EXCLUDED."status",
       "eventVersion"=EXCLUDED."eventVersion",
       "startAt"=EXCLUDED."startAt",
       "endAt"=EXCLUDED."endAt",
       "timeZone"=EXCLUDED."timeZone",
       "organiserId"=EXCLUDED."organiserId",
       "registrationEnabled"=EXCLUDED."registrationEnabled",
       "registrationWindow"=EXCLUDED."registrationWindow",
       "updatedAt"=now()
     WHERE "events"."eventVersion" < EXCLUDED."eventVersion"`,
    randomUUID(), data.eventId, data.title, data.description, data.eventVersion,
    data.startAt, data.endAt, data.timeZone, data.organiserId, data.registrationEnabled,
    data.registrationWindow,
  );
  const saved = await prisma.event.findUnique({ where: { eventId: data.eventId } });
  if (!saved) throw Error('Event projection was not persisted');
  return eventView(saved);
}

async function findRegistration(eventId, userId) {
  if (config.dataMode !== 'prisma') {
    return [...memory.registrations.values()]
      .filter(row => row.eventId === eventId && row.userId === userId)
      .sort((a, b) => Date.parse(b.registeredAt) - Date.parse(a.registeredAt))[0] || null;
  }
  return prisma.registration.findFirst({ where: { eventId, userId }, orderBy: { registeredAt: 'desc' } });
}

async function findRegistrationById(id) {
  if (!prisma) return [...memory.registrations.values()].find(row => row.id === id) || null;
  return prisma.registration.findUnique({ where: { id } });
}

async function saveRegistration(registration) {
  const row = { ...registration, id: registration.id || randomUUID() };
  if (config.dataMode !== 'prisma') {
    memory.registrations.set(row.id, row);
    return row;
  }
  return prisma.registration.create({ data: row });
}

async function countConfirmedRegistrations(eventId) {
  if (!prisma) return confirmedCountFromRows([...memory.registrations.values()], eventId);
  return prisma.registration.count({ where: { eventId, status: 'CONFIRMED' } });
}

async function registrationsForUser(userId) {
  if (!prisma) return [...memory.registrations.values()].filter(row => row.userId === userId);
  return prisma.registration.findMany({ where: { userId }, include: { event: true }, orderBy: { registeredAt: 'desc' } });
}

async function registrationsForEvent(eventId) {
  if (!prisma) return [...memory.registrations.values()].filter(row => row.eventId === eventId);
  return prisma.registration.findMany({ where: { eventId }, orderBy: { registeredAt: 'asc' } });
}

async function setRegistrationLimit(eventId, registrationLimit) {
  if (!prisma) {
    const entry = [...memory.events.entries()].find(([, row]) => row.eventId === eventId);
    if (!entry) return null;
    const [key, current] = entry;
    const updated = { ...current, registrationLimit, updatedAt: new Date() };
    memory.events.set(key, updated);
    return eventView(updated);
  }
  const updated = await prisma.event.update({ where: { eventId }, data: { registrationLimit } });
  return eventView(updated);
}

async function setWithdrawalPolicy(eventId, policy) {
  if (!prisma) {
    const entry = [...memory.events.entries()].find(([, row]) => row.eventId === eventId);
    if (!entry) return null;
    const [key, current] = entry;
    const updated = { ...current, ...policy, updatedAt: new Date() };
    memory.events.set(key, updated);
    return eventView(updated);
  }
  const updated = await prisma.event.update({ where: { eventId }, data: policy });
  return eventView(updated);
}

async function createRegistration(eventId, userId, now = new Date()) {
  const { canCreateRegistration, placesRemaining } = require('./domain/registration');
  if (!prisma) {
    const event = await findEvent(eventId);
    if (!event) throw ruleError(404, 'NOT_FOUND', 'Event not found.');
    const prior = await findRegistration(eventId, userId);
    if (prior?.status === 'CONFIRMED' || (prior?.status === 'WITHDRAWN' && event.allowReregistration !== true)) {
      throw ruleError(409, 'ALREADY_EXISTS', 'You already have a registration for this Event.');
    }
    const count = await countConfirmedRegistrations(eventId);
    const decision = canCreateRegistration(event, count, now);
    if (!decision.allowed) throw ruleError(409, decision.reason, registrationMessage(decision.reason));
    const registration = { id: randomUUID(), eventId, userId, status: 'CONFIRMED', registeredAt: now };
    const action = {
      id: randomUUID(), type: 'RegistrationCreated', aggregateType: 'Event', aggregateId: eventId,
      payload: { eventId, eventName: event.title, eventVersion: event.eventVersion ?? 0, userId, registrationId: registration.id, occurredAt: now.toISOString() },
      createdAt: now, attempts: 0, nextAttemptAt: now, deliveredAt: null, lastError: null, suppressedAt: null,
    };
    memory.registrations.set(registration.id, registration);
    memory.outbox.push(action);
    return { registration, placesRemaining: placesRemaining(event, count + 1) };
  }

  return prisma.$transaction(async tx => {
    const [event] = await tx.$queryRawUnsafe('SELECT * FROM "events" WHERE "eventId" = $1 FOR UPDATE', eventId);
    if (!event) throw ruleError(404, 'NOT_FOUND', 'Event not found.');
    const existing = await tx.registration.findFirst({ where: { eventId, userId }, orderBy: { registeredAt: 'desc' } });
    if (existing?.status === 'CONFIRMED' || (existing?.status === 'WITHDRAWN' && event.allowReregistration !== true)) {
      throw ruleError(409, 'ALREADY_EXISTS', 'You already have a registration for this Event.');
    }
    const count = await tx.registration.count({ where: { eventId, status: 'CONFIRMED' } });
    const decision = canCreateRegistration(event, count, now);
    if (!decision.allowed) throw ruleError(409, decision.reason, registrationMessage(decision.reason));
    const registration = await tx.registration.create({ data: { eventId, userId, status: 'CONFIRMED', registeredAt: now } });
    const actionId = randomUUID();
    await tx.attendanceOutbox.create({ data: {
      id: actionId, aggregateId: eventId, kind: 'RegistrationCreated',
      payload: { eventId, eventName: event.title, eventVersion: event.eventVersion, userId, registrationId: registration.id, occurredAt: now.toISOString() },
    } });
    return { registration, placesRemaining: placesRemaining(event, count + 1) };
  });
}

async function withdrawRegistration(registrationId, userId, now = new Date()) {
  const { canWithdraw } = require('./domain/withdrawal');
  if (!prisma) {
    const registration = await findRegistrationById(registrationId);
    if (!registration) throw ruleError(404, 'NOT_FOUND', 'Registration not found.');
    if (registration.userId !== userId) throw ruleError(403, 'FORBIDDEN', 'You can only withdraw your own registration.');
    const event = await findEvent(registration.eventId);
    if (!event) throw ruleError(404, 'NOT_FOUND', 'Event not found.');
    if (registration.status === 'WITHDRAWN') {
      return { registration, placesRemaining: placesRemaining(event, await countConfirmedRegistrations(event.eventId)), replayed: true };
    }
    const decision = canWithdraw(event, registration, now);
    if (!decision.allowed) throw ruleError(409, decision.reason, withdrawalMessage(decision.reason));
    const updated = { ...registration, status: 'WITHDRAWN', withdrawnAt: now.toISOString() };
    memory.registrations.set(registration.id, updated);
    const action = {
      id: randomUUID(), type: 'RegistrationWithdrawn', aggregateType: 'Event', aggregateId: event.eventId,
      payload: { eventId: event.eventId, eventName: event.title, eventVersion: event.eventVersion ?? 0, userId, registrationId, occurredAt: now.toISOString() },
      createdAt: now, attempts: 0, nextAttemptAt: now, deliveredAt: null, lastError: null, suppressedAt: null,
    };
    memory.outbox.push(action);
    return { registration: updated, placesRemaining: placesRemaining(event, await countConfirmedRegistrations(event.eventId)), replayed: false };
  }

  return prisma.$transaction(async tx => {
    const source = await tx.registration.findUnique({ where: { id: registrationId } });
    if (!source) throw ruleError(404, 'NOT_FOUND', 'Registration not found.');
    if (source.userId !== userId) throw ruleError(403, 'FORBIDDEN', 'You can only withdraw your own registration.');
    const [event] = await tx.$queryRawUnsafe('SELECT * FROM "events" WHERE "eventId" = $1 FOR UPDATE', source.eventId);
    if (!event) throw ruleError(404, 'NOT_FOUND', 'Event not found.');
    const registration = await tx.registration.findUnique({ where: { id: registrationId } });
    if (registration.status === 'WITHDRAWN') {
      const count = await tx.registration.count({ where: { eventId: event.eventId, status: 'CONFIRMED' } });
      return { registration, placesRemaining: placesRemaining(event, count), replayed: true };
    }
    const decision = canWithdraw(event, registration, now);
    if (!decision.allowed) throw ruleError(409, decision.reason, withdrawalMessage(decision.reason));
    const updated = await tx.registration.update({ where: { id: registrationId }, data: { status: 'WITHDRAWN', withdrawnAt: now } });
    const actionId = randomUUID();
    await tx.attendanceOutbox.create({ data: {
      id: actionId, aggregateId: event.eventId, kind: 'RegistrationWithdrawn',
      payload: { eventId: event.eventId, eventName: event.title, eventVersion: event.eventVersion, userId, registrationId, occurredAt: now.toISOString() },
    } });
    const count = await tx.registration.count({ where: { eventId: event.eventId, status: 'CONFIRMED' } });
    return { registration: updated, placesRemaining: placesRemaining(event, count), replayed: false };
  });
}

function withdrawalMessage(code) {
  return ({
    EVENT_NOT_ACTIVE: 'This Event is not active, so the registration cannot be withdrawn.',
    REGISTRATION_NOT_ACTIVE: 'This registration is no longer active.',
    WITHDRAWAL_DISABLED: 'The Organiser has not enabled registration withdrawal.',
    WITHDRAWAL_CLOSED: 'The withdrawal deadline has passed or has not been set.',
  })[code] || 'This registration cannot be withdrawn.';
}

function registrationMessage(code) {
  return ({
    EVENT_NOT_CONFIRMED: 'This Event is not currently confirmed and cannot accept registrations.',
    REGISTRATION_DISABLED: 'Registration is disabled for this Event.',
    REGISTRATION_LIMIT_UNSET: 'The Coordinator has not set a registration limit yet.',
    REGISTRATION_NOT_OPEN: 'Registration is outside its opening window.',
    EVENT_FULL: 'This Event has reached its registration limit.',
  })[code] || 'Registration cannot be completed.';
}

function listOutboxForTest() { return [...memory.outbox]; }

async function notificationRecipients(eventId){
 // Explicit permitted states exclude Withdrawn and unrelated future states.
 const statuses=['CONFIRMED','WAITLISTED','OFFERED'];
 const rows=prisma?await prisma.registration.findMany({where:{eventId,status:{in:statuses}},select:{userId:true}}):[...memory.registrations.values()].filter(row=>row.eventId===eventId&&statuses.includes(row.status));
 return [...new Set(rows.map(row=>row.userId))];
}
module.exports = {
  notificationRecipients,
  eventView,
  listEvents,
  findEvent,
  saveEvent,
  upsertConfirmedEvent,
  findRegistration,
  findRegistrationById,
  saveRegistration,
  countConfirmedRegistrations,
  registrationsForUser,
  registrationsForEvent,
  setRegistrationLimit,
  setWithdrawalPolicy,
  createRegistration,
  withdrawRegistration,
  listOutboxForTest,
  prismaClient: () => prisma,
};
