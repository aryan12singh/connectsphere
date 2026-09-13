import { describe, expect, it } from 'vitest'
import { isLoginResponse } from '../app/lib/auth'
import { isEventsResponse } from '../app/lib/events'
import { createLoginResponse, validateLoginBody } from '../server/utils/authMocks'
import { createEventsResponse } from '../server/utils/eventMocks'

/**
 * Contract tests against the real server sources (not copies).
 * They assert shapes, not rows — so they keep passing when the mock
 * data layer is swapped for production implementations.
 */
describe('BFF mock payloads honour the frontend contracts', () => {
  it('events response satisfies isEventsResponse', () => {
    expect(isEventsResponse(createEventsResponse())).toBe(true)
  })

  it('login response satisfies isLoginResponse', () => {
    expect(validateLoginBody({ email: 'a@b.co', password: 'secret', rememberMe: true })).toBeNull()
    expect(isLoginResponse(createLoginResponse('a@b.co'))).toBe(true)
  })

  it('login validation rejects incomplete credentials', () => {
    expect(validateLoginBody({})).toBe('Email and password are required')
    expect(validateLoginBody({ email: 'a@b.co' })).toBe('Email and password are required')
    expect(validateLoginBody({ password: 'secret' })).toBe('Email and password are required')
  })
})
