const { instant } = require('./time');

function holdIsExpired(deadline, at) {
  const expires = instant(deadline, 'deadline');
  return instant(at, 'at') >= expires;
}

function holdWarningDue(deadline, at, warningLeadMs) {
  if (!Number.isSafeInteger(warningLeadMs) || warningLeadMs < 0) {
    throw new RangeError('warningLeadMs must be explicit non-negative whole milliseconds');
  }
  const remaining = instant(deadline, 'deadline') - instant(at, 'at');
  return remaining > 0 && remaining <= warningLeadMs;
}

function validateHoldDeadline(hold, policy) {
  if (typeof policy?.allowExpiryAtOccupiedStart !== 'boolean') {
    throw new RangeError('allowExpiryAtOccupiedStart must be an explicit boolean policy');
  }
  const created = instant(hold?.createdAt, 'createdAt');
  const expires = instant(hold?.expiresAt, 'expiresAt');
  const occupiedStart = instant(hold?.occupiedStartAt, 'occupiedStartAt');
  if (expires <= created || (policy.allowExpiryAtOccupiedStart ? expires > occupiedStart : expires >= occupiedStart)) {
    throw new RangeError('expiresAt must follow creation and respect the selected occupied-start boundary');
  }
  return {};
}

module.exports = { holdIsExpired, holdWarningDue, validateHoldDeadline };
