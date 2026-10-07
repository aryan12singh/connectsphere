import { getHeader, getRequestURL } from 'h3'
import { recognisedRoles } from '~~/lib/roles'
import type { BackendUser } from '../../utils/backend'

// Choose a presentation role already granted to this account. This writes
// only the sealed cookie; it neither provisions roles nor changes capabilities.
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const origin = getHeader(event, 'origin')
  if (origin && origin !== getRequestURL(event).origin) throw createError({ statusCode: 403, statusMessage: 'Cross-origin writes are not allowed' })
  const { role } = await readBody<{ role?: unknown }>(event) || {}
  const { authMode } = useRuntimeConfig(event)
  let user = session.user
  if (authMode === 'live') {
    const token = await getSessionToken(event)
    const me = await backendFetch<{ user: BackendUser, permissions: string[] }>(event, '/auth/me', { token })
    user = toSessionUser(me.user, me.permissions)
  }
  else if (authMode !== 'mock') throw createError({ statusCode: 503, statusMessage: 'Authentication is not configured' })
  if (typeof role !== 'string' || !recognisedRoles(user).includes(role as ReturnType<typeof recognisedRoles>[number])) {
    throw createError({ statusCode: 403, statusMessage: 'This role is not assigned to your account' })
  }
  user = { ...user, role }
  await replaceUserSession(event, { user, secure: session.secure })
  return { user }
})
