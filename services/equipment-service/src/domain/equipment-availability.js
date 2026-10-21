function interval(value, startField, endField) {
  const start = Date.parse(value?.[startField]);
  const end = Date.parse(value?.[endField]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new RangeError(`Use a valid positive ${startField}/${endField} interval.`);
  return { start, end };
}

function peakCommitment(commitments, requestedWindow) {
  const points = [];
  for (const commitment of commitments) {
    if (!Number.isSafeInteger(commitment?.quantity) || commitment.quantity < 1) throw new RangeError('Commitment quantities must be positive whole numbers.');
    const window = interval(commitment, 'startAt', 'endAt');
    const start = Math.max(window.start, requestedWindow.start);
    const end = Math.min(window.end, requestedWindow.end);
    if (start < end) points.push([start, commitment.quantity], [end, -commitment.quantity]);
  }
  // A release is applied before a new allocation at the same instant. This
  // implements the half-open [startAt, endAt) interval policy.
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let used = 0;
  let peak = 0;
  for (const [, change] of points) {
    used += change;
    peak = Math.max(peak, used);
  }
  return peak;
}

function availabilityLine(total, requested, commitments, startAt, endAt) {
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(requested) || requested < 1 || !Array.isArray(commitments)) {
    throw new RangeError('Stock, request and commitments must use valid whole quantities.');
  }
  const window = interval({ startAt, endAt }, 'startAt', 'endAt');
  const used = peakCommitment(commitments, window);
  const available = Math.max(0, total - used);
  return { requested, available, shortfall: Math.max(0, requested - available) };
}

module.exports = { availabilityLine, peakCommitment };
