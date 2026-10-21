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

module.exports = {
  computeRegistrationLimit,
  isRegistrationOpen,
  getOwnRegistration,
  canReadOwnRegistration,
  isEventVisible,
};
