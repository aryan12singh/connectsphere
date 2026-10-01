/**
 * Live mode: whenever the login cookie is cleared, also end the backend
 * session behind it.
 *
 * Why a hook: the Sign out button (app/components/UserMenu.vue) calls
 * nuxt-auth-utils' built-in DELETE /api/_auth/session, not our
 * DELETE /api/auth. Both end in clearUserSession(), which fires this
 * 'clear' hook, so every way of signing out revokes the backend session.
 * Without it, a copy of the cookie taken before sign-out would keep
 * working until the session expired.
 *
 * `session.secure` is server-only data (see app/types/session.d.ts).
 */
export default defineNitroPlugin(() => {
  sessionHooks.hook('clear', async (session, event) => {
    const { authMode } = useRuntimeConfig(event)
    const token = session.secure?.token
    if (authMode === 'live' && token)
      await revokeBackendSession(event, token)
  })
})
