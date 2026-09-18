import { describe, expect, it } from 'vitest'
import { isLoginResponse } from '../app/lib/auth'
import { isEventsResponse } from '../app/lib/events'
import { createEventsResponse } from '../server/utils/eventMocks'

/**
 * Contract tests against the real server sources (not copies).
 * They assert shapes, not rows — so they keep passing when the mock
 * data layer is swapped for production implementations.
 * BFF validation is now in server/api/auth/login.post.ts, not utils.
 */
describe('BFF mock payloads honour the frontend contracts', () => {
  it('events response satisfies isEventsResponse', () => {
    expect(isEventsResponse(createEventsResponse())).toBe(true)
  })

  it('login response satisfies isLoginResponse for frontend roles (incl. TECHNICAL_SUPPORT_STAFF)', () => {
    expect(isLoginResponse({ user: { id: '1', email: 'a@b.co', name: 'A', role: 'EVENT_ORGANISER' }, token: 't' })).toBe(true)
    expect(isLoginResponse({ user: { id: '1', email: 'tech@example.com', name: 'Tech Support', role: 'TECHNICAL_SUPPORT_STAFF' }, token: 't' })).toBe(true)
    expect(isLoginResponse({ user: { id: '1', email: 'a@b.co', name: 'A', role: 'ADMIN' }, token: 't' })).toBe(false) // ADMIN never leaves BFF
  })
})
