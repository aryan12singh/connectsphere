// CS-31 / CS-32: Confirmed and Preparation events move to Completed on their own
// once the end time has passed. One pass is a plain function so it can be tested
// with a fake database; start() only repeats it on a timer.
//
// Safety rules kept:
//  - Only CONFIRMED / PREPARATION events qualify. Those stages are only ever
//    reached on a current Safety approval, and a stale or rejected Safety proof
//    already moves the event back to Planning, so it is never completed here.
//  - The status is re-read under the Event lock, so two servers (or a pass that
//    races a cancellation) cannot complete the same Event twice.
//  - The single transition guard (COMPLETE, system actor) has the final say.
const { decide, ACTIONS } = require('./domain/transitions');

const SYSTEM = Object.freeze({ id: null, system: true, roles: [] });
const BATCH = 100;

async function completeEnded({ prisma, now = new Date(), lockEvent = require('./eventLock').lockEvent } = {}) {
  if (!prisma) return { completed: 0, skipped: 0 };
  const due = await prisma.event.findMany({
    where: { status: { in: ['CONFIRMED', 'PREPARATION'] }, endAt: { lte: now } },
    select: { id: true },
    orderBy: { endAt: 'asc' },
    take: BATCH,
  });
  let completed = 0;
  let skipped = 0;
  for (const { id } of due) {
    const done = await prisma.$transaction(async (tx) => {
      const event = await lockEvent(tx, id);
      const from = event.status; // read before the update changes the row
      let result;
      try {
        result = decide({
          action: ACTIONS.COMPLETE,
          entity: { scope: 'EVENT', status: from },
          actor: SYSTEM,
          context: { organiserId: event.organiserId, currentCoordinatorId: event.eventRequest?.currentCoordinatorId ?? null, startAt: event.startAt, endAt: event.endAt, timeZone: event.timeZone, now },
        });
      } catch (error) {
        if (error?.status === 409) return false; // changed since we looked: leave it alone
        throw error;
      }
      await tx.event.update({ where: { id }, data: { status: result.to, version: { increment: 1 } } });
      await tx.activityLog.create({
        data: {
          eventRequestId: event.eventRequestId,
          action: 'COMPLETED',
          actorType: 'SYSTEM',
          actorId: null,
          fromStatus: from,
          toStatus: result.to,
          details: { eventId: event.id, note: 'Event ended; completed automatically', actorName: 'System' },
        },
      });
      return true;
    });
    if (done) completed += 1; else skipped += 1;
  }
  return { completed, skipped };
}

function start({ intervalMs = 60000 } = {}) {
  const config = require('./config');
  if (config.dataMode !== 'prisma' || process.env.NODE_ENV === 'test' || process.env.EVENT_COMPLETION_DISABLED === 'true') return null;
  const prisma = require('./db');
  let running = false;
  const timer = setInterval(async () => {
    if (running) return; // never overlap passes
    running = true;
    try { await completeEnded({ prisma }); } catch (error) { console.error('event completion pass failed:', error.message); } finally { running = false; }
  }, intervalMs);
  timer.unref();
  return { stop: async () => clearInterval(timer) };
}

module.exports = { completeEnded, start };
