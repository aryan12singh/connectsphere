// Which permissions each role has (auth_db.role_permissions).
const prisma = require('../db');
const { PERMISSIONS, ROLES, PROTECTED, isKnownPermission } = require('../lib/permissions');

// Returns an array like ["events.view", "attendance.register"].
async function getPermissionsForRole(role) {
  const rows = await prisma.rolePermission.findMany({ where: { role }, select: { permission: true } });
  return rows
    .map((row) => row.permission)
    .filter(isKnownPermission) // ignore leftovers from permissions removed in code
    .sort();
}

// Everything the admin "Permissions" screen needs in one response:
// the catalog (with descriptions), every role's permissions, and the
// permissions that can't be removed.
async function getMatrix() {
  const rows = await prisma.rolePermission.findMany();
  const roles = {};
  for (const role of ROLES) roles[role] = [];
  for (const row of rows) {
    if (roles[row.role] && isKnownPermission(row.permission)) roles[row.role].push(row.permission);
  }
  for (const role of ROLES) roles[role].sort();

  return {
    permissions: Object.entries(PERMISSIONS).map(([key, description]) => ({ key, description })),
    roles,
    protected: PROTECTED,
  };
}

/**
 * Replaces a role's permissions with the given list.
 * Protected permissions are always kept, even if left out of the list.
 * @returns {{ before: string[], after: string[] }} for the audit log
 */
async function setRolePermissions(role, permissions) {
  const wanted = new Set(permissions);
  for (const p of PROTECTED[role] || []) wanted.add(p);
  const after = [...wanted].sort();
  const before = await getPermissionsForRole(role);

  // Delete-then-insert inside one transaction, so a role never ends up
  // half-updated if something fails in the middle.
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { role } }),
    prisma.rolePermission.createMany({ data: after.map((permission) => ({ role, permission })) }),
  ]);

  return { before, after };
}

module.exports = { getPermissionsForRole, getMatrix, setRolePermissions };
