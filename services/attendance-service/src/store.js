const config = require('./config');

let prisma = null;
if (config.dataMode === 'prisma') {
  if (!config.databaseUrl) throw new Error('Missing required environment variable: DATABASE_URL');
  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg } = require('@prisma/adapter-pg');
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
}

const memory = { events: new Map(), registrations: new Map() };

function eventView(event) {
  return {
    id: event.id,
    eventId: event.eventId,
    title: event.title,
    description: event.description,
    status: event.status,
    startAt: event.startAt,
    endAt: event.endAt,
    timeZone: event.timeZone,
    primaryVenueId: event.primaryVenueId,
    primaryVenueName: event.primaryVenueName,
    registrationLimit: event.registrationLimit,
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
  findRegistration,
  saveRegistration,
};
