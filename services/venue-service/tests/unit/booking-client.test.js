const test = require('node:test');
const assert = require('node:assert/strict');
const { blockingBookingCount } = require('../../src/bookingClient');

test('CS-venue-INT-01: booking client sends the encoded venue and private credential', async () => {
  const previousFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ blockingCount: 2 }) };
  };
  try {
    assert.equal(await blockingBookingCount('venue/with spaces'), 2);
    assert.match(request.url, /venue-links\/venue%2Fwith%20spaces\?blockingOnly=true$/);
    assert.equal(request.options.headers['x-internal-api-key'], 'change-me-dev-internal-key');
  } finally {
    global.fetch = previousFetch;
  }
});

test('CS-venue-INT-02: non-success booking responses fail closed to the venue route', async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 503 });
  try {
    await assert.rejects(() => blockingBookingCount('venue-1'), /Booking service returned 503/);
  } finally {
    global.fetch = previousFetch;
  }
});

test('CS-venue-INT-03: malformed booking counts are rejected', async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ blockingCount: 'one' }) });
  try {
    await assert.rejects(() => blockingBookingCount('venue-1'), /invalid blocking count/);
  } finally {
    global.fetch = previousFetch;
  }
});
