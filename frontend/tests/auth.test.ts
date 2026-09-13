import { describe, expect, it, vi } from 'vitest'
import { isLoginResponse, loginWithBff } from '../app/lib/auth'
import { makeLoginResponse, makeUser } from './factories'

describe('loginWithBff (frontend BFF client)', () => {
  it('posts credentials to the BFF login route and returns the user, whatever the dataset', async () => {
    const mockResponse = makeLoginResponse('producer@example.com')
    const fetchMock = vi.fn().mockResolvedValue(mockResponse)

    const result = await loginWithBff(
      {
        email: 'producer@example.com',
        password: 'password123',
        rememberMe: true,
      },
      fetchMock as typeof $fetch,
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      body: { email: 'producer@example.com', password: 'password123', rememberMe: true },
    })
    expect(result).toEqual(mockResponse)
  })

  it('surfaces the BFF rejection message unchanged', async () => {
    const fetchMock = vi.fn().mockRejectedValue(
      Object.assign(new Error('Account locked'), { statusCode: 403 }),
    )

    await expect(loginWithBff(
      {
        email: 'producer@example.com',
        password: 'wrong',
        rememberMe: false,
      },
      fetchMock as typeof $fetch,
    )).rejects.toThrow('Account locked')
  })
})

describe('isLoginResponse (BFF contract)', () => {
  it('accepts any well-formed login payload, not just the mock user', () => {
    expect(isLoginResponse(makeLoginResponse())).toBe(true)
    expect(isLoginResponse({
      user: makeUser({ email: 'real@venue.sg', role: 'coordinator' }),
      token: 'prod-jwt',
    })).toBe(true)
  })

  it('rejects malformed payloads', () => {
    expect(isLoginResponse(null)).toBe(false)
    expect(isLoginResponse({})).toBe(false)
    expect(isLoginResponse({ user: makeUser() })).toBe(false)
    expect(isLoginResponse({ user: { ...makeUser(), email: 42 }, token: 't' })).toBe(false)
    expect(isLoginResponse({ user: makeUser(), token: 't', extra: 'ok' })).toBe(true)
  })
})
