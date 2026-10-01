/**
 * BFF proxy for the tech support admin API — /api/admin/* → auth-service /admin/*.
 *
 * Examples (see app/composables/useAdminApi.ts for all of them):
 *   GET   /api/admin/users?search=tan
 *   PATCH /api/admin/users/<id>/role      { role }
 *   PUT   /api/admin/settings              { sessionTtlHours: 12 }
 *
 * The BFF adds the session token; auth-service checks the permission on
 * every call (403 if the user lacks it). Live mode only — there are no mock
 * admin data.
 */

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH'] as const
type AllowedMethod = typeof ALLOWED_METHODS[number]

// Only plain path segments ("users", "roles/ATTENDEE/permissions", a UUID).
// Blocks tricks like "../internal/..." from reaching other backend paths.
const SAFE_PATH = /^[\w-]+(?:\/[\w-]+)*$/

export default defineEventHandler(async (event) => {
  const { authMode } = useRuntimeConfig(event)
  if (authMode !== 'live')
    throw createError({ statusCode: 501, statusMessage: 'The admin API needs NUXT_AUTH_MODE=live' })

  const token = await getSessionToken(event) // 401 if not logged in

  const path = getRouterParam(event, 'path') ?? ''
  if (!SAFE_PATH.test(path))
    throw createError({ statusCode: 400, statusMessage: 'Invalid admin path' })

  const method = event.method as AllowedMethod
  if (!ALLOWED_METHODS.includes(method))
    throw createError({ statusCode: 405, statusMessage: 'Method not allowed' })

  return backendFetch(event, `/admin/${path}`, {
    method,
    token,
    query: getQuery(event),
    body: method === 'GET' ? undefined : await readBody(event),
  })
})
