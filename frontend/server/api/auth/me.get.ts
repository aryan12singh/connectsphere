import type { BackendUser } from '../../utils/backend'

/**
 * BFF "who am I" — GET /api/auth/me.
 *
 * Live mode: asks auth-service whether the session is still valid and
 * refreshes the user + permissions in the cookie (so a role or permission
 * change by tech support shows up without logging in again). If the backend
 * session has ended, backendFetch clears the cookie and this returns 401.
 *
 * Mock mode: returns the session user as-is.
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const { authMode } = useRuntimeConfig(event)

  if (authMode !== 'live')
    return { user: session.user }

  const token = await getSessionToken(event)
  const me = await backendFetch<{ user: BackendUser, permissions: string[] }>(event, '/auth/me', { token })
  const user = toSessionUser(me.user, me.permissions, session.user.role)

  await replaceUserSession(event, { user, secure: { token } })
  return { user }
})
