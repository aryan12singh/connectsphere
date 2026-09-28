/**
 * BFF logout — DELETE /api/auth.
 *
 * Live mode: ends the session at auth-service too (sets `revokedAt`), so the
 * token is dead even if the cookie were copied. Then clears the sealed
 * session cookie (nuxt-auth-utils). Succeeds even without a session, and
 * even if the backend is unreachable — the user is always logged out here.
 */
export default defineEventHandler(async (event) => {
  const { authMode } = useRuntimeConfig(event)

  // Mock mode has no backend session to end; only the cookie.
  if (authMode === 'live') {
    const session = await getUserSession(event)
    const token = session.secure?.token
    if (token) {
      try {
        await backendFetch(event, '/auth/logout', { method: 'POST', token })
      }
      catch {
        // Already expired/revoked, or backend down: nothing more to do.
      }
    }
  }

  await clearUserSession(event)
  return { ok: true }
})
