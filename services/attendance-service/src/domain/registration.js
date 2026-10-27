function computeRegistrationLimit(event) {
  return event.registrationLimit;
}

function isRegistrationOpen(registrationWindow, now = new Date()) {
  if (!registrationWindow) return false;
  const start = new Date(registrationWindow.startAt);
  const end = new Date(registrationWindow.endAt);
  return now >= start && now <= end;
}

function getOwnRegistration(registrations, userId) {
  if (!Array.isArray(registrations)) return null;
  return registrations.find(r => r.userId === userId) || null;
}

function canReadOwnRegistration(event, registrations, userId, actorId) {
  if (!isEventVisible(event.status)) return false;
  const own = getOwnRegistration(registrations, userId);
  if (!own) return false;
  return own.userId === actorId;
}

function isEventVisible(status) {
  return status === 'CONFIRMED' || status === 'CANCELLED';
}

function canCreateRegistration(event, confirmedRegistrationCount, now = new Date()) {
  if (event?.status !== 'CONFIRMED') return { allowed: false, reason: 'EVENT_NOT_CONFIRMED' };
  if (event.registrationEnabled !== true) return { allowed: false, reason: 'REGISTRATION_DISABLED' };
  if (event.registrationLimit == null) return { allowed: false, reason: 'REGISTRATION_LIMIT_UNSET' };
  if (!isRegistrationOpen(event.registrationWindow, now)) return { allowed: false, reason: 'REGISTRATION_NOT_OPEN' };
  if (confirmedRegistrationCount >= event.registrationLimit) return { allowed: false, reason: 'EVENT_FULL' };
  return { allowed: true };
}

function placesRemaining(event, confirmedRegistrationCount) {
  if (event?.registrationLimit == null) return null;
  return Math.max(0, event.registrationLimit - confirmedRegistrationCount);
}

module.exports = {
  computeRegistrationLimit,
  isRegistrationOpen,
  getOwnRegistration,
  canReadOwnRegistration,
  isEventVisible,
  canCreateRegistration,
  placesRemaining,
};
