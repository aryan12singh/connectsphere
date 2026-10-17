// CS-50: turn one domain message into in-app notices.
//
// Safe to call more than once for the same message (broker redelivery,
// relay replay): a message already PROCESSED, IGNORED or FAILED is skipped,
// and the database also refuses a second notice for the same
// message + recipient + type.
//
// If building the notices fails (e.g. user-service is down), it retries up
// to 3 times, then marks the message FAILED for Technical Support. It never
// re-runs the business action and never reports success it did not have.
const config = require('./config');
const store = require('./store');
const { HANDLED, noticesFor } = require('./templates');
const { displayName, activeUsersWithRole } = require('./userClient');

const DONE = ['PROCESSED', 'IGNORED', 'FAILED'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function validMessage(message) {
  return message && typeof message.id === 'string' && message.id
    && typeof message.type === 'string' && message.type
    && message.payload && typeof message.payload === 'object';
}

/**
 * @returns {Promise<{ result: 'processed'|'ignored'|'duplicate'|'failed', notices: number }>}
 */
async function deliver(message, { names = displayName, usersWithRole = activeUsersWithRole } = {}) {
  if (!validMessage(message)) throw Object.assign(new Error('Invalid message'), { status: 422 });
  const receipt = await store.getReceipt(message.id);
  if (receipt && DONE.includes(receipt.status)) return { result: 'duplicate', notices: 0 };

  if (!HANDLED.includes(message.type)) {
    await store.saveDelivered(message, [], 'IGNORED');
    return { result: 'ignored', notices: 0 };
  }

  // First try + 3 retries. Attempts already used (e.g. before a restart) count.
  const totalAttempts = config.maxRetries + 1;
  let attempt = receipt?.attempts || 0;
  for (;;) {
    try {
      // Leave out recipients the message does not name (e.g. no Coordinator yet).
      const notices = (await noticesFor(message, { names, usersWithRole })).filter((notice) => notice.recipientId);
      await store.saveDelivered(message, notices);
      return { result: 'processed', notices: notices.length };
    } catch (error) {
      // A parallel redelivery of the same message may have just finished it
      // (our insert then lost the race). That is not a failure.
      const latest = await store.getReceipt(message.id);
      if (latest && ['PROCESSED', 'IGNORED'].includes(latest.status)) return { result: 'duplicate', notices: 0 };
      attempt = await store.recordAttempt(message, attempt + 1 >= totalAttempts ? 'FAILED' : 'RETRYING', error);
      console.error(`Notification delivery for message ${message.id} failed (attempt ${attempt}/${totalAttempts}):`, error.message);
      if (attempt >= totalAttempts) return { result: 'failed', notices: 0 };
      await sleep(config.retryDelayMs);
    }
  }
}

module.exports = { deliver };
