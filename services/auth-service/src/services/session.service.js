// Everything to do with sessions: create one at login, look one up on each
// request, revoke one at logout (or all of a user's when they're disabled).
const prisma = require('../db');
const { generateToken, hashToken } = require('../lib/tokens');
const userService = require('../clients/userService');
const settingsService = require('./settings.service');
const permissionService = require('./permission.service');

// Only write lastUsedAt if the stored value is older than this. Saves a
// database write on every single request while keeping the idle timeout
// accurate to within a minute.
const LAST_USED_WRITE_INTERVAL_MS = 60 * 1000;

/**
 * Starts a new session for a user. Session length comes from the admin
 * settings, so changing it affects logins made after the change.
 * @returns {{ token: string, expiresAt: Date }} — the plain token is only
 *          ever available here; after this we only have its hash.
 */
async function createSession(userId) {
  const { sessionTtlHours } = await settingsService.getSettings();
  const token = generateToken();
  const expiresAt = new Date(Date.now() + sessionTtlHours * 60 * 60 * 1000);

  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });

  return { token, expiresAt };
}

/**
 * Finds the user behind a token, if the session is still valid.
 * A session is valid when it exists, hasn't been revoked, hasn't expired,
 * hasn't been idle too long, and belongs to an active user.
 * @returns {{ session, user, permissions } | null}
 */
async function resolveToken(token) {
  if (!token) {
    return null;
  }

  const now = new Date();
  const session = await prisma.session.findFirst({
    where: { tokenHash: hashToken(token), revokedAt: null, expiresAt: { gt: now } },
  });
  if (!session) {
    return null;
  }

  // Idle timeout (0 = off). A session never used since login counts from createdAt.
  const { idleTimeoutMinutes } = await settingsService.getSettings();
  const lastActivity = session.lastUsedAt || session.createdAt;
  if (idleTimeoutMinutes > 0 && now - lastActivity > idleTimeoutMinutes * 60 * 1000) {
    await revokeSession(session.id); // end it for good
    return null;
  }

  // Load the user fresh on every request, so a role change or a disable
  // takes effect straight away instead of when the session ends.
  const user = await userService.findUserById(session.userId);
  if (!user || !user.isActive) {
    return null;
  }

  if (now - lastActivity > LAST_USED_WRITE_INTERVAL_MS) {
    await prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: now } });
  }

  const permissions = await permissionService.getPermissionsForRole(user.role);
  return { session, user, permissions };
}

// Marks a session as logged out. It can never be used again.
async function revokeSession(sessionId) {
  await prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
}

// Ends every open session a user has (used when an account is disabled).
async function revokeAllSessionsForUser(userId) {
  await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

module.exports = { createSession, resolveToken, revokeSession, revokeAllSessionsForUser };
