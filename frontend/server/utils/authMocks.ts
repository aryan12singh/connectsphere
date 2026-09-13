import type { LoginResponse } from '~/lib/auth'

export interface LoginBody {
  email?: unknown
  password?: unknown
  rememberMe?: unknown
}

/** Pure input validation for POST /api/auth/login. Returns an error message or null. */
export function validateLoginBody(body: unknown): string | null {
  if (typeof body !== 'object' || body === null)
    return 'Email and password are required'
  const { email, password } = body as LoginBody
  if (typeof email !== 'string' || email.length === 0 || typeof password !== 'string' || password.length === 0)
    return 'Email and password are required'
  return null
}

/** Mock login response. Replace with the real auth service; keep the contract. */
export function createLoginResponse(email: string): LoginResponse {
  return {
    user: {
      id: 'mock-user-1',
      email,
      name: 'Event Organiser',
      role: 'organiser',
    },
    token: 'mock-token-123',
  }
}
