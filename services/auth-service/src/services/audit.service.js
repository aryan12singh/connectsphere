// Records account actions (auth_db.audit_logs): sign-ups and controlled-setup
// status changes, so the team can see who changed what and when.
const prisma = require('../db');

// Standard action names, so the log is easy to filter.
const ACTIONS = Object.freeze({
  USER_REGISTERED: 'USER_REGISTERED', // self sign-up
  USER_DISABLED: 'USER_DISABLED',
  USER_ENABLED: 'USER_ENABLED',
});

function record(actorId, action, targetId, details) {
  return prisma.auditLog.create({ data: { actorId, action, targetId, details } });
}

module.exports = { ACTIONS, record };
