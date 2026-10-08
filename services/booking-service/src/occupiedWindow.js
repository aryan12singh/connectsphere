const { instant } = require('./time');
const MINUTE_MS = 60_000;

function interval(window) {
  const start = instant(window?.startAt, 'startAt');
  const end = instant(window?.endAt, 'endAt');
  if (end <= start) throw new RangeError('endAt must be after startAt');
  return { start, end };
}

function minutes(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be non-negative whole minutes`);
  }
  return value;
}

function occupiedWindow(booking, buffers) {
  const advertised = interval(booking);
  const setup = minutes(buffers?.setupMinutes, 'setupMinutes');
  const turnaround = minutes(buffers?.turnaroundMinutes, 'turnaroundMinutes');
  const start = new Date(advertised.start - setup * MINUTE_MS);
  const end = new Date(advertised.end + turnaround * MINUTE_MS);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw new RangeError('The occupied window exceeds representable date-time instants');
  }
  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
}

function occupiedWindowsOverlap(first, second, policy) {
  if (typeof policy?.allowTouching !== 'boolean') {
    throw new RangeError('allowTouching must be an explicit boolean policy');
  }
  const a = interval(first);
  const b = interval(second);
  return policy.allowTouching
    ? a.start < b.end && b.start < a.end
    : a.start <= b.end && b.start <= a.end;
}

module.exports = { occupiedWindow, occupiedWindowsOverlap };
