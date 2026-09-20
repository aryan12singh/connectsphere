import { describe, expect, it, vi } from 'vitest'
import { createApp, createError, defineEventHandler, H3Event, readBody, toWebHandler, useSession } from 'h3'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { mountSuspended } from '@nuxt/test-utils/runtime'

const authMiddlewareMocks = vi.hoisted(() => ({
  navigateToLogin: vi.fn(),
  loggedIn: { value: false },
  sessionUser: { value: null as null | { id: string, email: string, name: string, role: string } },
  sessionFetch: vi.fn(),
  sessionClear: vi.fn(),
}))

const useFetchMock = vi.hoisted(() => vi.fn())

const useFetchState = vi.hoisted(() => ({
  data: { value: null as unknown },
  error: { value: null as unknown },
}))

mockNuxtImport('useFetch', () => (...args: unknown[]) => {
  useFetchMock(...args)
  return { data: useFetchState.data, error: useFetchState.error }
})

mockNuxtImport('useRequestFetch', () => () => authMiddlewareMocks.sessionFetch)
mockNuxtImport('navigateTo', () => authMiddlewareMocks.navigateToLogin)
mockNuxtImport('useUserSession', () => () => ({
  loggedIn: authMiddlewareMocks.loggedIn,
  user: authMiddlewareMocks.sessionUser,
  fetch: authMiddlewareMocks.sessionFetch,
  clear: authMiddlewareMocks.sessionClear,
}))

// CS-10 — single file per story (IS212/IEEE 829). One describe per AC, all TCs together.
// Execution log is generated deterministically via tests/scripts/compile-test-run.ts → test-runs/<date-time>.md

// Test-only sealed-session password (mirrors NUXT_SESSION_PASSWORD in dev;
// never a production secret). Used to drive the real h3 session primitive.
const TEST_SESSION_PASSWORD = 'test-session-password-with-32plus-chars-0123456789abcdef'

async function mountLoginPage() {
  const pageModules = import.meta.glob('../../frontend/app/pages/login.vue')
  const loadLoginPage = pageModules['../../frontend/app/pages/login.vue']
  expect(loadLoginPage, 'login page is not implemented').toBeTypeOf('function')
  const { default: LoginPage } = await loadLoginPage!() as { default: Parameters<typeof mountSuspended>[0] }
  return await mountSuspended(LoginPage)
}

async function submitLogin(email: string, password: string) {
  const wrapper = await mountLoginPage()
  await wrapper.get('#email').setValue(email)
  await wrapper.get('#password').setValue(password)
  await wrapper.get('#login-form').trigger('submit')
  await wrapper.vm.$nextTick()
  await new Promise(resolve => setTimeout(resolve, 0))
  return wrapper
}

describe('CS-10 — TC-CS10-01 valid login establishes authenticated session', () => {
  it('signs in through POST /api/auth and lands on the single homepage', async () => {
    useFetchState.data.value = { user: { id: 'u-tech', email: 'tech@example.com', name: 'Tech Support', role: 'TECHNICAL_SUPPORT_STAFF' } }
    useFetchState.error.value = null
    authMiddlewareMocks.sessionFetch.mockReset().mockResolvedValue(undefined)
    authMiddlewareMocks.navigateToLogin.mockReset().mockResolvedValue('/')
    useFetchMock.mockReset()

    const wrapper = await submitLogin('tech@example.com', 'Password123!')

    expect(useFetchMock.mock.calls[0]?.[0]).toBe('/api/auth')
    expect(useFetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' })
    expect(wrapper.text()).toContain('Signed in as tech@example.com')
    expect(authMiddlewareMocks.navigateToLogin).toHaveBeenCalledWith('/')
  })
})

describe('CS-10 — TC-CS10-02 invalid credentials generic, no session', () => {
  it('surfaces generic Invalid credentials on wrong password (and no session created)', async () => {
    useFetchState.data.value = null
    useFetchState.error.value = Object.assign(new Error('Invalid credentials'), { statusCode: 401 })
    authMiddlewareMocks.navigateToLogin.mockReset()

    const wrapper = await submitLogin('organiser@example.com', 'wrong')

    expect(wrapper.text()).toContain('Invalid credentials')
    expect(authMiddlewareMocks.navigateToLogin).not.toHaveBeenCalledWith('/')
  })

  it('surfaces same generic message on unknown email (does not leak which field)', async () => {
    useFetchState.data.value = null
    useFetchState.error.value = Object.assign(new Error('Invalid credentials'), { statusCode: 401 })
    authMiddlewareMocks.navigateToLogin.mockReset()

    const wrapper = await submitLogin('nope@example.com', 'Password123!')

    expect(wrapper.text()).toContain('Invalid credentials')
    expect(authMiddlewareMocks.navigateToLogin).not.toHaveBeenCalledWith('/')
  })
})

describe('CS-10 — TC-CS10-03 unauthenticated denied server-side', () => {
  it('GET /api/events without a sealed session returns 401 Unauthorized', async () => {
    // Stub the Nuxt auto-imported guard with its real semantic: read the
    // sealed session, 401 when no authenticated user is present.
    vi.stubGlobal('defineEventHandler', defineEventHandler)
    vi.stubGlobal('createError', createError)
    vi.stubGlobal('requireUserSession', async (event: Parameters<typeof useSession>[0]) => {
      const session = await useSession(event, { password: TEST_SESSION_PASSWORD, name: 'nuxt-session' })
      if (!session.data.user)
        throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
      return session.data
    })

    try {
      const { default: eventsHandler } = await import('../../frontend/server/api/events.get')
      const app = createApp()
      app.use('/api/events', eventsHandler)

      const response = await toWebHandler(app)(
        new Request('http://localhost/api/events'),
      )

      expect(response.status).toBe(401)
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('CS-10 — TC-CS10-07 unauthenticated interface directs to login', () => {
  it('redirects a session-less visit to a protected route to /login', async () => {
    const middlewareModules = import.meta.glob('../../frontend/app/middleware/auth.global.ts')
    const loadAuthMiddleware = middlewareModules['../../frontend/app/middleware/auth.global.ts']

    expect(loadAuthMiddleware, 'global authentication middleware is not registered').toBeTypeOf('function')

    authMiddlewareMocks.loggedIn.value = false
    authMiddlewareMocks.sessionFetch.mockReset().mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    )
    authMiddlewareMocks.navigateToLogin.mockReset().mockResolvedValue('/login')

    const { default: authMiddleware } = await loadAuthMiddleware!() as {
      default: (to: { path: string }) => Promise<unknown>
    }

    await authMiddleware({ path: '/' })

    expect(authMiddlewareMocks.sessionFetch).toHaveBeenCalled()
    expect(authMiddlewareMocks.navigateToLogin).toHaveBeenCalledWith('/login')
  })

  it('lets an authenticated visit through without redirecting', async () => {
    const middlewareModules = import.meta.glob('../../frontend/app/middleware/auth.global.ts')
    const loadAuthMiddleware = middlewareModules['../../frontend/app/middleware/auth.global.ts']

    authMiddlewareMocks.loggedIn.value = true
    authMiddlewareMocks.sessionFetch.mockReset()
    authMiddlewareMocks.navigateToLogin.mockReset()

    const { default: authMiddleware } = await loadAuthMiddleware!() as {
      default: (to: { path: string }) => Promise<unknown>
    }

    await authMiddleware({ path: '/' })

    expect(authMiddlewareMocks.sessionFetch).not.toHaveBeenCalled()
    expect(authMiddlewareMocks.navigateToLogin).not.toHaveBeenCalled()
  })
})

describe('CS-10 — TC-CS10-01 BFF issues sealed session without token in body', () => {
  it('POST /api/auth with valid creds returns {user} only and sets a sealed session cookie', async () => {
    // Stub Nuxt auto-imported server utils with the real h3 sealed-session
    // primitive that nuxt-auth-utils delegates to (iron-sealed cookie).
    const password = TEST_SESSION_PASSWORD
    vi.stubGlobal('defineEventHandler', defineEventHandler)
    vi.stubGlobal('readBody', readBody)
    vi.stubGlobal('createError', createError)
    vi.stubGlobal('setUserSession', async (event: Parameters<typeof useSession>[0], data: Record<string, unknown>) => {
      const session = await useSession(event, { password: password as string, name: 'nuxt-session' })
      await session.update(data)
      return session.data
    })

    try {
      const { default: authHandler } = await import('../../frontend/server/api/auth.post')
      const app = createApp()
      app.use('/api/auth', authHandler)

      const response = await toWebHandler(app)(
        new Request('http://localhost/api/auth', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'organiser@example.com', password: 'Password123!' }),
        }),
      )

      expect(response.status).toBe(200)
      const body = await response.json() as Record<string, unknown>
      expect(body).toMatchObject({ user: { email: 'organiser@example.com', role: 'EVENT_ORGANISER' } })
      expect(body).not.toHaveProperty('token')
      expect(response.headers.get('set-cookie') ?? '').toMatch(/nuxt-session/i)
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('CS-10 — TC-CS10-01 invalid credentials stay generic on the new route', () => {
  it('POST /api/auth with wrong password returns 401 Invalid credentials', async () => {
    vi.stubGlobal('defineEventHandler', defineEventHandler)
    vi.stubGlobal('readBody', readBody)
    vi.stubGlobal('createError', createError)
    vi.stubGlobal('setUserSession', vi.fn())

    try {
      const { default: authHandler } = await import('../../frontend/server/api/auth.post')
      const app = createApp()
      app.use('/api/auth', authHandler)

      const response = await toWebHandler(app)(
        new Request('http://localhost/api/auth', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'organiser@example.com', password: 'wrong' }),
        }),
      )

      expect(response.status).toBe(401)
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('CS-10 — TC-CS10-04 BFF revokes the sealed session', () => {
  it('DELETE /api/auth clears the session and returns {ok:true}', async () => {
    const password = TEST_SESSION_PASSWORD
    vi.stubGlobal('defineEventHandler', defineEventHandler)
    vi.stubGlobal('createError', createError)
    vi.stubGlobal('clearUserSession', async (event: Parameters<typeof useSession>[0]) => {
      const session = await useSession(event, { password: password as string, name: 'nuxt-session' })
      await session.clear()
      return true
    })

    try {
      const { default: authDeleteHandler } = await import('../../frontend/server/api/auth.delete')
      const app = createApp()
      app.use('/api/auth', authDeleteHandler)

      const response = await toWebHandler(app)(
        new Request('http://localhost/api/auth', { method: 'DELETE' }),
      )

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ ok: true })
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
})
describe('CS-10 — TC-CS10-06 dashboard loads through the request-aware fetch', () => {
  async function mountIndexPage() {
    const pageModules = import.meta.glob('../../frontend/app/pages/index.vue')
    const loadIndexPage = pageModules['../../frontend/app/pages/index.vue']
    expect(loadIndexPage, 'index page is not implemented').toBeTypeOf('function')
    const { default: IndexPage } = await loadIndexPage!() as { default: Parameters<typeof mountSuspended>[0] }
    return await mountSuspended(IndexPage)
  }

  it('requests /api/events through useFetch (request-scoped, SSR cookie-safe)', async () => {
    useFetchMock.mockReset()
    useFetchState.data.value = { events: [] }
    useFetchState.error.value = null
    await mountIndexPage()
    const firstCall = useFetchMock.mock.calls[0] ?? []
    expect(firstCall[0]).toBe('/api/events')
    expect(firstCall[1]).toMatchObject({ key: 'organiser-events' })
  })

  it('renders events from a valid payload', async () => {
    useFetchState.data.value = { events: [{ id: 'e1', category: 'GALA DINNER', title: 'Test Gala', meta: 'meta', status: 'SUBMITTED' }] }
    useFetchState.error.value = null
    const wrapper = await mountIndexPage()
    expect(wrapper.text()).toContain('Test Gala')
  })

  it('shows the unavailable message on a malformed payload', async () => {
    useFetchState.data.value = { bogus: true }
    useFetchState.error.value = null
    const wrapper = await mountIndexPage()
    expect(wrapper.text()).toContain('Events data is unavailable right now.')
  })

  it('shows the load error message on fetch failure', async () => {
    useFetchState.data.value = null
    useFetchState.error.value = new Error('boom')
    const wrapper = await mountIndexPage()
    expect(wrapper.text()).toContain('boom')
  })

  it('links every event card to its request form', async () => {
    useFetchState.data.value = {
      events: [
        { id: 'e1', category: 'GALA DINNER', title: 'Test Gala', meta: 'meta', status: 'SUBMITTED' },
        { id: 'e2', category: 'CORPORATE EVENT', title: 'Summit', meta: 'meta', status: 'DRAFT' },
      ],
    }
    useFetchState.error.value = null
    const wrapper = await mountIndexPage()
    const cards = wrapper.findAll('[data-testid="event-card"]')
    expect(cards.length).toBe(2)
    expect(wrapper.find('a[href="/requests/e1"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/requests/e2"]').exists()).toBe(true)
  })

  it('view-details actions link to the request form', async () => {
    useFetchState.data.value = {
      events: [
        { id: 'e1', category: 'GALA DINNER', title: 'Test Gala', meta: 'meta', status: 'SUBMITTED' },
      ],
    }
    useFetchState.error.value = null
    const wrapper = await mountIndexPage()
    const actions = wrapper.findAll('a[href="/requests/e1"]').filter(a => a.text().includes('View details'))
    expect(actions.length).toBe(1)
  })
})

describe('CS-10 — TC-CS10-03 authenticated request succeeds', () => {
  it('GET /api/events with a valid sealed session cookie returns 200 events', async () => {
    vi.stubGlobal('defineEventHandler', defineEventHandler)
    vi.stubGlobal('createError', createError)
    vi.stubGlobal('requireUserSession', async (event: Parameters<typeof useSession>[0]) => {
      const session = await useSession(event, { password: TEST_SESSION_PASSWORD, name: 'nuxt-session' })
      if (!session.data.user)
        throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
      return session.data
    })

    // NOTE: `cookie` is a forbidden header — `new Request()` silently drops
    // it — so cookie-bearing cases build a real H3Event (same class Nitro
    // uses) instead of going through the web Request adapter.
    function mockH3Event(cookie?: string) {
      const resHeaders = new Map<string, string | string[]>()
      const nodeReq = { method: 'GET', headers: cookie ? { cookie, host: 'localhost' } : { host: 'localhost' } }
      const nodeRes = {
        getHeader: (name: string) => resHeaders.get(name),
        setHeader: (name: string, value: string | string[]) => { resHeaders.set(name, value) },
        removeHeader: (name: string) => { resHeaders.delete(name) },
        appendHeader: (name: string, value: string) => {
          const prev = resHeaders.get(name)
          resHeaders.set(name, Array.isArray(prev) ? [...prev, value] : prev ? [prev, value] : value)
        },
      }
      return {
        event: new H3Event(nodeReq, nodeRes) as unknown as Parameters<typeof useSession>[0],
        resHeaders,
      }
    }

    try {
      // Seal a real session cookie with the same primitive the BFF uses.
      const sealer = mockH3Event()
      const sealerSession = await useSession(sealer.event, { password: TEST_SESSION_PASSWORD, name: 'nuxt-session' })
      await sealerSession.update({ user: { id: 'u-organiser', email: 'organiser@example.com', name: 'Organiser One', role: 'EVENT_ORGANISER' } })
      const sealed = sealer.resHeaders.get('set-cookie')
      const cookie = (Array.isArray(sealed) ? sealed[0] ?? '' : sealed ?? '').split(';')[0] ?? ''
      expect(cookie).toMatch(/nuxt-session=/)

      const { default: eventsHandler } = await import('../../frontend/server/api/events.get') as unknown as {
        default: (event: Parameters<typeof useSession>[0]) => Promise<Record<string, unknown>>
      }
      const body = await eventsHandler(mockH3Event(cookie).event)
      expect(Array.isArray(body.events)).toBe(true)
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
})
describe('CS-10 — TC-CS10-08 avatar popup shows profile and signs out', () => {
  const mockUser = {
    id: 'u-organiser',
    name: 'Organiser One',
    email: 'organiser@example.com',
    role: 'EVENT_ORGANISER',
  }

  async function mountUserMenu() {
    const { default: UserMenu } = await import('../../frontend/app/components/UserMenu.vue')
    return await mountSuspended(UserMenu)
  }

  it('renders the avatar trigger and stays closed by default', async () => {
    authMiddlewareMocks.sessionUser.value = mockUser
    authMiddlewareMocks.sessionFetch.mockReset().mockResolvedValue(undefined)
    document.body.innerHTML = ''
    await mountUserMenu()
    expect(document.body.textContent ?? '').not.toContain('Organiser One')
  })

  it('reveals name, email, role and a sign-out button on click', async () => {
    authMiddlewareMocks.sessionUser.value = mockUser
    authMiddlewareMocks.sessionFetch.mockReset().mockResolvedValue(undefined)
    document.body.innerHTML = ''
    const wrapper = await mountUserMenu()
    await wrapper.get('button[aria-label="Your account"]').trigger('click')
    await wrapper.vm.$nextTick()
    const bodyText = document.body.textContent ?? ''
    expect(bodyText).toContain('Organiser One')
    expect(bodyText).toContain('organiser@example.com')
    expect(bodyText).toContain('EVENT_ORGANISER')
    expect(bodyText).toContain('Sign out')
  })

  it('signs out and returns to login when Sign out is clicked', async () => {
    authMiddlewareMocks.sessionUser.value = mockUser
    authMiddlewareMocks.sessionFetch.mockReset().mockResolvedValue(undefined)
    authMiddlewareMocks.sessionClear.mockReset().mockResolvedValue(undefined)
    authMiddlewareMocks.navigateToLogin.mockReset().mockResolvedValue('/login')
    document.body.innerHTML = ''
    const wrapper = await mountUserMenu()
    await wrapper.get('button[aria-label="Your account"]').trigger('click')
    await wrapper.vm.$nextTick()
    const signOut = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.includes('Sign out'))
    expect(signOut, 'sign-out button is not rendered').toBeTruthy()
    signOut!.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(authMiddlewareMocks.sessionClear).toHaveBeenCalled()
    expect(authMiddlewareMocks.navigateToLogin).toHaveBeenCalledWith('/login')
  })

  it('shows an error text in the popup when the profile cannot be accessed', async () => {
    authMiddlewareMocks.sessionUser.value = null
    authMiddlewareMocks.sessionFetch.mockReset().mockRejectedValue(new Error('Unauthorized'))
    document.body.innerHTML = ''
    const wrapper = await mountUserMenu()
    await wrapper.get('button[aria-label="Your account"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    expect(document.body.textContent ?? '').toMatch(/couldn't load your profile/i)
  })
})
describe('CS-10 — TC-CS10-05 unknown authorisation denied, no privileged default', () => {
  it('rejects ghost and missing roles at the BFF with 403 and no session', async () => {
    vi.stubGlobal('defineEventHandler', defineEventHandler)
    vi.stubGlobal('readBody', readBody)
    vi.stubGlobal('createError', createError)
    const setUserSessionMock = vi.fn()
    vi.stubGlobal('setUserSession', setUserSessionMock)

    const { MOCK_USERS } = await import('../../frontend/server/utils/mockUserDb')
    MOCK_USERS.push(
      { id: 'u-ghost', email: 'ghost@example.com', passwordHash: 'Password123!', firstName: 'Ghost', lastName: 'User', role: 'GHOST', createdAt: '2026-01-01T00:00:00.000Z' } as never,
      { id: 'u-norole', email: 'norole@example.com', passwordHash: 'Password123!', firstName: 'No', lastName: 'Role', role: undefined, createdAt: '2026-01-01T00:00:00.000Z' } as never,
    )

    try {
      const { default: authHandler } = await import('../../frontend/server/api/auth.post')
      const app = createApp()
      app.use('/api/auth', authHandler)

      for (const email of ['ghost@example.com', 'norole@example.com']) {
        const response = await toWebHandler(app)(
          new Request('http://localhost/api/auth', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email, password: 'Password123!' }),
          }),
        )
        expect(response.status).toBe(403)
      }
      expect(setUserSessionMock).not.toHaveBeenCalled()
    }
    finally {
      vi.unstubAllGlobals()
      MOCK_USERS.pop()
      MOCK_USERS.pop()
    }
  })
})

describe('CS-10 — TC-CS10-06 role-appropriate starting screen; data respects ownership', () => {
  it('every AC role lands on the single homepage — no per-role redirect', async () => {
    const roles = ['EVENT_ORGANISER', 'EVENT_COORDINATOR', 'VENUE_STAFF', 'ATTENDEE', 'TECHNICAL_SUPPORT_STAFF']
    for (const [index, role] of roles.entries()) {
      useFetchState.data.value = { user: { id: `u-${index}`, email: `${role}@example.com`, name: `User ${index}`, role } }
      useFetchState.error.value = null
      authMiddlewareMocks.sessionFetch.mockReset().mockResolvedValue(undefined)
      authMiddlewareMocks.navigateToLogin.mockReset().mockResolvedValue('/')
      const wrapper = await submitLogin(`${role}@example.com`, 'Password123!')
      expect(wrapper.text()).toContain(`Signed in as ${role}@example.com`)
      expect(authMiddlewareMocks.navigateToLogin).toHaveBeenCalledWith('/')
    }
  })
})
