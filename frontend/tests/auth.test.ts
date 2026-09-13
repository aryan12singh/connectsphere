import { describe, expect, it, vi } from 'vitest'
import { loginWithBff } from '../app/lib/auth'

describe('loginWithBff (frontend BFF client)', () => {
  it('posts credentials to the BFF login route and returns the mock user', async () => {
    const mockResponse = {
      user: { id: 'mock-user-1', email: 'm@example.com', name: 'Event Organiser', role: 'organiser' },
      token: 'mock-token-123',
    }
    const fetchMock = vi.fn().mockResolvedValue(mockResponse)

    const result = await loginWithBff(
      {
        email: 'm@example.com',
        password: 'password123',
        rememberMe: true,
      },
      fetchMock as typeof $fetch,
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      body: { email: 'm@example.com', password: 'password123', rememberMe: true },
    })
    expect(result).toEqual(mockResponse)
  })

  it('throws a friendly error when the BFF rejects the login', async () => {
    const fetchMock = vi.fn().mockRejectedValue(
      Object.assign(new Error('Invalid credentials'), { statusCode: 401 }),
    )

    await expect(loginWithBff(
      {
        email: 'm@example.com',
        password: 'wrong',
        rememberMe: false,
      },
      fetchMock as typeof $fetch,
    )).rejects.toThrow('Invalid credentials')
  })
})
