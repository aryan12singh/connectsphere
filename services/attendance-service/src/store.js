const config = require('./config');
const { randomUUID } = require('node:crypto');

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
    const key = `${eventId}:${userId}`;
    return memory.registrations.get(key) || null;
  }
  return prisma.registration.findUnique({ where: { Registrations_eventId_userId_key: { eventId, userId } } });
}

async function saveRegistration(registration) {
  if (config.dataMode !== 'prisma') {
    const key = `${registration.eventId}:${registration.userId}`;
    memory.registrations.set(key, registration);
    return registration;
  }
  return prisma.registration.create({ data: registration });
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

async function createRegistration(eventId, userId, now = new Date()) {
  const { canCreateRegistration, placesRemaining } = require('./domain/registration');
  if (!prisma) {
    const event = await findEvent(eventId);
    if (!event) throw ruleError(404, 'NOT_FOUND', 'Event not found.');
    if (await findRegistration(eventId, userId)) throw ruleError(409, 'ALREADY_EXISTS', 'You already have a registration for this Event.');
    const count = await countConfirmedRegistrations(eventId);
    const decision = canCreateRegistration(event, count, now);
    if (!decision.allowed) throw ruleError(409, decision.reason, registrationMessage(decision.reason));
    const registration = { id: randomUUID(), eventId, userId, status: 'CONFIRMED', registeredAt: now };
    const action = {
      id: randomUUID(), type: 'RegistrationCreated', aggregateType: 'Event', aggregateId: eventId,
      payload: { eventId, eventName: event.title, eventVersion: event.eventVersion ?? 0, userId, registrationId: registration.id, occurredAt: now.toISOString() },
      createdAt: now, attempts: 0, nextAttemptAt: now, deliveredAt: null, lastError: null, suppressedAt: null,
    };
    memory.registrations.set(`${eventId}:${userId}`, registration);
    memory.outbox.push(action);
    return { registration, placesRemaining: placesRemaining(event, count + 1) };
  }

  return prisma.$transaction(async tx => {
    const [event] = await tx.$queryRawUnsafe('SELECT * FROM "events" WHERE "eventId" = $1 FOR UPDATE', eventId);
    if (!event) throw ruleError(404, 'NOT_FOUND', 'Event not found.');
    const existing = await tx.registration.findUnique({ where: { Registrations_eventId_userId_key: { eventId, userId } } });
    if (existing) throw ruleError(409, 'ALREADY_EXISTS', 'You already have a registration for this Event.');
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
  saveRegistration,
  countConfirmedRegistrations,
  registrationsForUser,
  registrationsForEvent,
  setRegistrationLimit,
  createRegistration,
  listOutboxForTest,
  prismaClient: () => prisma,
};
