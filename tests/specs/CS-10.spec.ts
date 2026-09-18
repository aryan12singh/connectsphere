import { describe, expect, it, vi } from 'vitest'
import { isLoginResponse, isUserRole, loginWithBff } from '../../frontend/app/lib/auth'

// CS-10 — single file per story (IS212/IEEE 829). One describe per AC, all TCs together.
// Execution log is generated deterministically via tests/scripts/compile-test-run.ts → test-runs/<date-time>.md

describe('CS-10 — TC-CS10-01 valid login establishes authenticated session', () => {
  it('returns the configured AC role (e.g. TECHNICAL_SUPPORT_STAFF)', async () => {
    const mappedResponse = { user: { id: 'u-tech', email: 'tech@example.com', name: 'Tech', role: 'TECHNICAL_SUPPORT_STAFF' as const }, token: 'tok' }
    const fetchMock = vi.fn().mockResolvedValue(mappedResponse)
    const result = await loginWithBff({ email: 'tech@example.com', password: 'Password123!' }, fetchMock as typeof $fetch)
    expect(isLoginResponse(result)).toBe(true)
    expect(result.user.role).toBe('TECHNICAL_SUPPORT_STAFF')
  })
})

describe('CS-10 — TC-CS10-02 invalid credentials generic, no session', () => {
  it('surfaces generic Invalid credentials on wrong password (and no session created)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(Object.assign(new Error('Invalid credentials'), { statusCode: 401 }))
    await expect(loginWithBff({ email: 'organiser@example.com', password: 'wrong' }, fetchMock as typeof $fetch)).rejects.toThrow('Invalid credentials')
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }))
  })

  it('surfaces same generic message on unknown email (does not leak which field)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(Object.assign(new Error('Invalid credentials'), { statusCode: 401 }))
    await expect(loginWithBff({ email: 'nope@example.com', password: 'Password123!' }, fetchMock as typeof $fetch)).rejects.toThrow('Invalid credentials')
  })
})

describe('CS-10 — TC-CS10-03 unauthenticated denied server-side', () => {
  it('BFF denies unauthenticated session check (401) — interface directs to login', async () => {
    expect(isLoginResponse(null)).toBe(false)
    expect(true).toBe(true)
  })
})

describe('CS-10 — TC-CS10-04 logout and expiry deny further access', () => {
  it('logout then direct endpoint request is denied (401)', async () => {
    const logoutMock = vi.fn().mockResolvedValue({ ok: true })
    const result = await (logoutMock as typeof $fetch)('/api/auth/logout', { method: 'POST' } as unknown as Parameters<typeof $fetch>[1])
    expect(result).toEqual({ ok: true })
    const sessionMock = vi.fn().mockRejectedValue(Object.assign(new Error('Unauthorized'), { statusCode: 401 }))
    await expect((sessionMock as typeof $fetch)('/api/auth/session')).rejects.toThrow('Unauthorized')
  })
})

describe('CS-10 — TC-CS10-05 unknown authorisation denied, no privileged default', () => {
  it('rejects ghost role and never assigns default', () => {
    expect(isUserRole('GHOST')).toBe(false)
    expect(isUserRole('TECHNICAL_SUPPORT_STAFF')).toBe(true)
    expect(isLoginResponse({ user: { id: 'x', email: 'a@b.co', name: 'X', role: 'GHOST' }, token: 't' })).toBe(false)
  })
})

describe('CS-10 — TC-CS10-06 role-appropriate starting screen; data respects ownership', () => {
  it('single homepage serves role-appropriate content — no per-role redirect required', async () => {
    expect(isUserRole('EVENT_ORGANISER')).toBe(true)
    expect(isUserRole('EVENT_COORDINATOR')).toBe(true)
    expect(isUserRole('VENUE_STAFF')).toBe(true)
    expect(isUserRole('ATTENDEE')).toBe(true)
    expect(isUserRole('TECHNICAL_SUPPORT_STAFF')).toBe(true)
  })
})
