import type { H3Event } from 'h3'
import { FetchError, ofetch } from 'ofetch'

/**
 * The BFF's one door to the real backend (auth-service and friends, reached
 * through Kong at runtimeConfig.apiBaseUrl).
 *
 * - Pass `token` to call as the logged-in user (sent as a Bearer header).
 * - Backend errors come back as h3 errors with the backend's message, so
 *   BFF routes can simply let them bubble up.
 * - A 401 on a token call means the backend session is over (expired, idle,
 *   logged out elsewhere, account disabled): the sealed cookie is cleared
 *   too, so the app sends the user to /login.
 */
export async function backendFetch<T>(
  event: H3Event,
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    body?: unknown
    query?: Record<string, unknown>
    token?: string
  } = {},
): Promise<T> {
  const { apiBaseUrl } = useRuntimeConfig(event)
  try {
    // ofetch (not Nitro's $fetch): this is an external backend, not a /api route.
    return await ofetch<T>(path, {
      baseURL: apiBaseUrl,
      method: options.method ?? 'GET',
      body: options.body as Record<string, unknown> | undefined,
      query: options.query,
      headers: options.token ? { Authorization: `Bearer ${options.token}` } : undefined,
      timeout: 10_000,
    })
  }
  catch (error) {
    if (error instanceof FetchError && error.statusCode) {
      if (error.statusCode === 401 && options.token)
        await clearUserSession(event)
      const data = error.data as { error?: string, details?: string[] } | undefined
      throw createError({
        statusCode: error.statusCode,
        statusMessage: data?.error ?? 'Request failed',
        data,
      })
    }
    // No HTTP answer at all: Kong or the service is down / unreachable.
    throw createError({ statusCode: 503, statusMessage: 'The ConnectSphere service is unavailable. Please try again shortly.' })
  }
}

/**
 * The backend session token for the current request. Throws 401 if there is
 * no login. The token lives in the session's `secure` part: server-only.
 */
export async function getSessionToken(event: H3Event): Promise<string> {
  const session = await requireUserSession(event)
  const token = session.secure?.token
  if (!token)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return token
}

/** Shape the backend returns for a user (auth-service /auth/login and /auth/me). */
export interface BackendUser {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  company: string | null
  isActive: boolean
}

/** Converts a backend user + permissions into what we keep in the session. */
export function toSessionUser(user: BackendUser, permissions: string[]) {
  return {
    id: user.id,
    email: user.email,
    name: `${user.firstName} ${user.lastName}`,
    role: user.role,
    permissions,
  }
}
