/**
 * BFF logout — DELETE /api/auth.
 *
 * Revokes the opaque token at the auth-service (sets `revokedAt`) and clears
 * the sealed session cookie (nuxt-auth-utils). Until the service lands,
 * revocation is an in-file mock stub; the `clearUserSession` binding below
 * is the production shape and stays. Succeeds even without a session.
 */

// Mock stub standing in for: auth-service session revoke (sets revokedAt).
function revokeTokenAtAuthService() {
  return true
}

export default defineEventHandler(async (event) => {
  revokeTokenAtAuthService()
  await clearUserSession(event)
  return { ok: true }
})
