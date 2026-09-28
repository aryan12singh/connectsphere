// Records admin actions (auth_db.audit_logs) so the team can see who
// changed what and when.
const prisma = require('../db');

// Standard action names, so the log is easy to filter.
const ACTIONS = Object.freeze({
  USER_CREATED: 'USER_CREATED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_DISABLED: 'USER_DISABLED',
  USER_ENABLED: 'USER_ENABLED',
  ROLE_PERMISSIONS_CHANGED: 'ROLE_PERMISSIONS_CHANGED',
  SETTINGS_UPDATED: 'SETTINGS_UPDATED',
});

function record(actorId, action, targetId, details) {
  return prisma.auditLog.create({ data: { actorId, action, targetId, details } });
}

// Newest first, 50 per page.
async function list(page = 1) {
  const PAGE_SIZE = 50;
  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.auditLog.count(),
  ]);
  return { entries, page, pageSize: PAGE_SIZE, total };
}

module.exports = { ACTIONS, record, list };
