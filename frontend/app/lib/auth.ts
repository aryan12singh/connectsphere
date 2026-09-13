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
