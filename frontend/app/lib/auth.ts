export interface LoginPayload {
  email: string
  password: string
  rememberMe: boolean
}

export interface MockUser {
  id: string
  email: string
  name: string
  role: string
}

export interface LoginResponse {
  user: MockUser
  token: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Runtime contract guard — true for any well-formed login payload, mock or production. */
export function isLoginResponse(value: unknown): value is LoginResponse {
  if (!isRecord(value) || !isRecord(value.user) || typeof value.token !== 'string')
    return false
  const user = value.user
  return typeof user.id === 'string'
    && typeof user.email === 'string'
    && typeof user.name === 'string'
    && typeof user.role === 'string'
}

/**
 * Modular frontend client for the BFF login route.
 * The BFF (`server/api/auth/login.post.ts`) returns mock data for now;
 * swap the route implementation later without touching callers.
 * `fetcher` is injectable so the client stays unit-testable.
 */
export async function loginWithBff(
  payload: LoginPayload,
  fetcher: typeof $fetch = $fetch,
): Promise<LoginResponse> {
  return await fetcher<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: payload,
  })
}
