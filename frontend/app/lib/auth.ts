export type FrontendRole = 'EVENT_ORGANISER' | 'EVENT_COORDINATOR' | 'VENUE_STAFF' | 'ATTENDEE' | 'TECHNICAL_SUPPORT_STAFF'
export type BackendRole = 'EVENT_ORGANISER' | 'EVENT_COORDINATOR' | 'VENUE_STAFF' | 'ATTENDEE' | 'ADMIN'
export type UserRole = FrontendRole

export const ROLE_HOME: Record<UserRole, string> = {
  EVENT_ORGANISER: '/',
  EVENT_COORDINATOR: '/coordinator',
  VENUE_STAFF: '/venues',
  ATTENDEE: '/attendee',
  TECHNICAL_SUPPORT_STAFF: '/support',
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (Object.keys(ROLE_HOME) as UserRole[]).includes(value as UserRole)
}

export interface LoginPayload {
  email: string
  password: string
}

export interface MockUser {
  id: string
  email: string
  name: string
  role: UserRole
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
    && isUserRole(user.role)
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
