// CS-54: the cancellation runner (orchestrator step) for whole-Event cancellation.
//
// After the Coordinator cancels, the Event sits in CANCELLING. This runner finishes the job:
//   1. ask booking-service to release the venue holds      -> returns a receiptId
//   2. ask equipment-service to release the reservations   -> success reply with the same action id
//   3. hand both receipts to finalize(), which makes the Event CANCELLED and emits EventCancelled
// Registration is not a step here: attendance refuses new registrations by reading the Event
// status (decided with the team), so it needs no release call and no receipt.
//
// Safe to repeat: both release calls are idempotent on the cancellation action ID, finalize
// replays safely, and a failed step leaves the Event in CANCELLING so the next pass retries it.
// One pass is a plain function so it can be tested with fake clients; start() only repeats it.
const config = require('./config');

const BATCH = 50;
const TIMEOUT_MS = 10000;
const SAME = (a, b) => a === b;

async function call(base, path, body) {
  let response;
  try {
    response = await fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-api-key': config.internalApiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw Object.assign(new Error('A release service is unavailable'), { retry: true });
  }
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(json?.error?.message || `Release failed (${response.status})`), { status: response.status, code: json?.error?.code });
  return json;
}

const httpClients = {
  releaseVenue: (eventId, body) => call(config.bookingServiceUrl, `/internal/events/${encodeURIComponent(eventId)}/cancellation-release`, body),
  releaseEquipment: (eventId, body) => call(config.equipmentServiceUrl, `/internal/events/${encodeURIComponent(eventId)}/reservations/release`, body),
};

// Check the venue reply really is for this Event and action before trusting it.
function venueReceipt(intent, reply) {
  if (!reply || reply.resource !== 'VENUE' || typeof reply.receiptId !== 'string' || !reply.receiptId.trim()
    || !SAME(reply.eventId, intent.eventId) || !SAME(reply.cancellationActionId, intent.id) || !SAME(reply.eventVersion, intent.acceptedEventVersion))
    throw Object.assign(new Error('The venue release reply does not match this cancellation'), { retry: true });
  return { resource: 'VENUE', receiptId: reply.receiptId, cancellationActionId: intent.id, eventVersion: intent.acceptedEventVersion };
}

// Equipment replies with the released reservations but no receipt id. A reply that names this
// Event and this action is the confirmation; its receipt id is derived from the action id so a
// retry always produces the same value.
function equipmentReceipt(intent, reply) {
  if (!reply || !SAME(reply.eventId, intent.eventId) || !SAME(reply.cancellationActionId, intent.id))
    throw Object.assign(new Error('The equipment release reply does not match this cancellation'), { retry: true });
  return { resource: 'EQUIPMENT', receiptId: `equipment:${intent.id}`, cancellationActionId: intent.id, eventVersion: intent.acceptedEventVersion };
}

async function runPending({ prisma, clients = httpClients, finalize = require('./cancellation').finalize } = {}) {
  if (!prisma) return { finalized: 0, failed: 0 };
  const waiting = await prisma.eventCancellationIntent.findMany({
    where: { event: { status: 'CANCELLING' } },
    select: { id: true, eventId: true, acceptedEventVersion: true },
    orderBy: { acceptedAt: 'asc' },
    take: BATCH,
  });
  let finalized = 0;
  let failed = 0;
  for (const intent of waiting) {
    try {
      const venue = venueReceipt(intent, await clients.releaseVenue(intent.eventId, { eventVersion: intent.acceptedEventVersion, cancellationActionId: intent.id }));
      const equipment = equipmentReceipt(intent, await clients.releaseEquipment(intent.eventId, { cancellationActionId: intent.id }));
      await finalize(intent.eventId, { cancellationActionId: intent.id, receipts: [venue, equipment] });
      finalized += 1;
    } catch (error) {
      failed += 1; // stays CANCELLING; the next pass tries again
      console.error(`cancellation ${intent.id} not finished yet:`, error.message);
    }
  }
  return { finalized, failed };
}

function start({ intervalMs = 15000 } = {}) {
  if (config.dataMode !== 'prisma' || process.env.NODE_ENV === 'test' || process.env.EVENT_CANCELLATION_RUNNER_DISABLED === 'true') return null;
  const prisma = require('./db');
  let running = false;
  const timer = setInterval(async () => {
    if (running) return; // never overlap passes
    running = true;
    try { await runPending({ prisma }); } catch (error) { console.error('cancellation pass failed:', error.message); } finally { running = false; }
  }, intervalMs);
  timer.unref();
  return { stop: async () => clearInterval(timer) };
}

module.exports = { runPending, start, venueReceipt, equipmentReceipt };
