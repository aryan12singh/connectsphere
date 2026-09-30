/**
 * BFF logout — DELETE /api/auth.
 *
 * Clears the sealed session cookie (nuxt-auth-utils). In live mode the
 * backend session is revoked too (auth-service sets `revokedAt`): that is
 * done by server/plugins/revoke-backend-session.ts, which runs on every
 * clearUserSession() — including the built-in DELETE /api/_auth/session
 * that the Sign out button uses. Succeeds even without a session, and even
 * if the backend is unreachable — the user is always logged out here.
 */
export default defineEventHandler(async (event) => {
  await clearUserSession(event)
  return { ok: true }
})
