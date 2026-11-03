// Which permissions each role has (auth_db.role_permissions, seeded by migrations).
const prisma = require('../db');
const { isKnownPermission } = require('../lib/permissions');
const { rolesForUser } = require('../../../utils/role-policy');

async function getPermissionsForUser(user) {
  const roles = rolesForUser(user);
  if (!roles.length) return [];
  const rows = await prisma.rolePermission.findMany({ where: { role: { in: roles } }, select: { permission: true } });
  // Leftover rows for permissions removed in code are ignored.
  return [...new Set(rows.map(row => row.permission).filter(isKnownPermission))].sort();
}

module.exports = { getPermissionsForUser };
