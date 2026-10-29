function canWithdraw(event, registration, now = new Date()) {
  if (event?.status !== 'CONFIRMED') return { allowed: false, reason: 'EVENT_NOT_ACTIVE' };
  if (!registration || registration.status !== 'CONFIRMED') return { allowed: false, reason: 'REGISTRATION_NOT_ACTIVE' };
  if (event.withdrawalEnabled !== true) return { allowed: false, reason: 'WITHDRAWAL_DISABLED' };
  const cutoff = event.withdrawalCutoffAt && new Date(event.withdrawalCutoffAt);
  if (!cutoff || !Number.isFinite(cutoff.getTime()) || now > cutoff) return { allowed: false, reason: 'WITHDRAWAL_CLOSED' };
  return { allowed: true };
}

module.exports = { canWithdraw };
