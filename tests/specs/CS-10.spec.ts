import { describe, expect, it, vi } from 'vitest'
import { getQuery, createApp, createError, defineEventHandler, H3Event, readBody, toWebHandler, useSession } from 'h3'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { mountSuspended } from '@nuxt/test-utils/runtime'

const authMiddlewareMocks = vi.hoisted(() => ({
  navigateToLogin: vi.fn(),
  loggedIn: { value: false },
  sessionUser: { value: null as null | { id: string, email: string, name: string, role: string, roles?: string[], permissions?: string[] } },
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

vi.mock('../../frontend/server/utils/kongBff',()=>({kongBffFetch:async(event:any,path:string)=>{const session=await (globalThis as any).requireUserSession(event);return path==='/auth/me'?{user:session.user}:{items:[]}}}))

// CS-10 — single file per story (IS212/IEEE 829). One describe per AC, all TCs together.

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
    vi.stubGlobal('getQuery', getQuery)
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

  it('lets an authenticated organiser visit through without redirecting', async () => {
    const middlewareModules = import.meta.glob('../../frontend/app/middleware/auth.global.ts')
    const loadAuthMiddleware = middlewareModules['../../frontend/app/middleware/auth.global.ts']

    authMiddlewareMocks.loggedIn.value = true
    authMiddlewareMocks.sessionUser.value = { id: 'u-organiser', email: 'organiser@example.com', name: 'Organiser One', role: 'EVENT_ORGANISER' }
    authMiddlewareMocks.sessionFetch.mockReset()
    authMiddlewareMocks.navigateToLogin.mockReset()

    const { default: authMiddleware } = await loadAuthMiddleware!() as {
      default: (to: { path: string }) => Promise<unknown>
    }

    await authMiddleware({ path: '/' })

    expect(authMiddlewareMocks.sessionFetch).not.toHaveBeenCalled()
    expect(authMiddlewareMocks.navigateToLogin).not.toHaveBeenCalled()
  })

  it('lets an authenticated coordinator visit through without redirecting', async () => {
    const middlewareModules = import.meta.glob('../../frontend/app/middleware/auth.global.ts')
    const loadAuthMiddleware = middlewareModules['../../frontend/app/middleware/auth.global.ts']

    authMiddlewareMocks.loggedIn.value = true
    authMiddlewareMocks.sessionUser.value = { id: 'u-coordinator', email: 'coordinator@example.com', name: 'Coordinator One', role: 'EVENT_COORDINATOR' }
    authMiddlewareMocks.sessionFetch.mockReset()
    authMiddlewareMocks.navigateToLogin.mockReset().mockResolvedValue('/login')

    const { default: authMiddleware } = await loadAuthMiddleware!() as {
      default: (to: { path: string }) => Promise<unknown>
    }

    await authMiddleware({ path: '/' })

    expect(authMiddlewareMocks.navigateToLogin).not.toHaveBeenCalled()
  })

  // The earlier "for now" expectation contradicted CS-10 AC6 (all five
  // homes). This correction tests the current requirement, not a login loop.
  it('TC-CS10-10 sends an authenticated Attendee to the Attendee home', async () => {
    const middlewareModules = import.meta.glob('../../frontend/app/middleware/auth.global.ts')
    const loadAuthMiddleware = middlewareModules['../../frontend/app/middleware/auth.global.ts']

    authMiddlewareMocks.loggedIn.value = true
    authMiddlewareMocks.sessionUser.value = { id: 'u-attendee', email: 'attendee@example.com', name: 'Attendee One', role: 'ATTENDEE' }
    authMiddlewareMocks.sessionFetch.mockReset()
    authMiddlewareMocks.navigateToLogin.mockReset().mockResolvedValue('/login')

    const { default: authMiddleware } = await loadAuthMiddleware!() as {
      default: (to: { path: string }) => Promise<unknown>
    }

    await authMiddleware({ path: '/' })

    expect(authMiddlewareMocks.navigateToLogin).toHaveBeenCalledWith('/attendances')
  })
  it('TC-CS10-11 sends Technical Support to the technical requirements review queue and denies an unknown role', async () => {
    const { default: middleware } = await import('../../frontend/app/middleware/auth.global')
    authMiddlewareMocks.loggedIn.value = true
    authMiddlewareMocks.sessionUser.value = { id: 'tech', email: 'tech@example.test', name: 'Tech', role: 'TECHNICAL_SUPPORT_STAFF' }
    authMiddlewareMocks.navigateToLogin.mockClear()
    await middleware({ path: '/' } as never)
    expect(authMiddlewareMocks.navigateToLogin).toHaveBeenCalledWith('/technical-requirements')
    authMiddlewareMocks.sessionUser.value = { ...authMiddlewareMocks.sessionUser.value, role: 'UNKNOWN', roles: [] }
    authMiddlewareMocks.navigateToLogin.mockClear()
    await middleware({ path: '/' } as never)
    expect(authMiddlewareMocks.navigateToLogin).toHaveBeenCalledWith('/access-denied')
  })
  it('TC-CS10-16 denies a Venue Staff member typing a Coordinator review URL', async () => {
    const { default: middleware } = await import('../../frontend/app/middleware/auth.global')
    authMiddlewareMocks.loggedIn.value = true
    authMiddlewareMocks.sessionUser.value = { id: 'staff', email: 'staff@example.test', name: 'Staff', role: 'VENUE_STAFF' }
    authMiddlewareMocks.navigateToLogin.mockClear()
    await middleware({ path: '/requests/a-request' } as never)
    expect(authMiddlewareMocks.navigateToLogin).toHaveBeenCalledWith('/access-denied')
  })
  it('TC-CS10-12 presents an accessible switch for every server-issued role', async () => {
    authMiddlewareMocks.sessionUser.value = { id: 'multi', email: 'multi@example.test', name: 'Multiple Roles', role: 'EVENT_ORGANISER', roles: ['EVENT_ORGANISER', 'ATTENDEE'] }
    const { default: UserMenu } = await import('../../frontend/app/components/navbar/UserMenu.vue')
    const wrapper = await mountSuspended(UserMenu)
    await wrapper.get('[aria-label="Your account"]').trigger('click')
    await wrapper.vm.$nextTick()
    const select = document.body.querySelector('select[aria-label="Active role"]') as HTMLSelectElement | null
    expect(select).not.toBeNull()
    expect([...select!.options].map(o => o.value)).toEqual(['EVENT_ORGANISER', 'ATTENDEE'])
    wrapper.unmount()
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
    vi.stubGlobal('getQuery', getQuery)
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
    vi.stubGlobal('getQuery', getQuery)
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
    vi.stubGlobal('getQuery', getQuery)
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
    vi.stubGlobal('getQuery', getQuery)
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
    const { default: UserMenu } = await import('../../frontend/app/components/navbar/UserMenu.vue')
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
    vi.stubGlobal('getQuery', getQuery)
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

describe('CS-10 — TC-CS10-09 configuration fails closed',()=>{
 it('unknown authentication mode is denied, with only explicit live/mock supported',async()=>{
  const {resolveAuthMode}=await import('../../frontend/server/api/auth.post')
  expect(resolveAuthMode('live')).toBe('live');expect(resolveAuthMode('mock')).toBe('mock')
  for(const mode of ['misspelled-live',undefined,'']){
   let error:any;try{resolveAuthMode(mode)}catch(e){error=e}
   expect(error?.statusCode).toBe(503)
  }
 })
})

describe('CS-10 — TC-CS10-17 credential form hydration safety', () => {
  it('SSR disables credential inputs and submission until handlers attach', async () => {
    const { createSSRApp } = await import('vue')
    const { renderToString } = await import('@vue/server-renderer')
    const { default: Page } = await import('../../frontend/app/pages/login.vue')
    const html = await renderToString(createSSRApp(Page))
    const container = document.createElement('div'); container.innerHTML = html
    const fields = [...container.querySelectorAll('form input')] as HTMLInputElement[]
    expect(fields.length).toBeGreaterThan(0)
    expect(fields.every(field => field.disabled)).toBe(true)
    expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true)
  })
})

it('TC-CS10-18 the recognized Safety Officer can obtain a sealed BFF session without exposing its token',async()=>{
 vi.stubGlobal('defineEventHandler',defineEventHandler);vi.stubGlobal('readBody',readBody);vi.stubGlobal('createError',createError)
 const seal=vi.fn();vi.stubGlobal('setUserSession',seal)
 const {MOCK_USERS}=await import('../../frontend/server/utils/mockUserDb')
 MOCK_USERS.push({id:'officer-login-regression',email:'officer-regression@example.test',passwordHash:'Password123!',firstName:'Safety',lastName:'Officer',role:'SAFETY_OFFICER',createdAt:'2026-10-17T00:00:00Z',company:'ConnectSphere'})
 try{
  const {default:handler}=await import('../../frontend/server/api/auth.post')
  const app=createApp();app.use('/api/auth',handler)
  const response=await toWebHandler(app)(new Request('http://localhost/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'officer-regression@example.test',password:'Password123!'})}))
  expect(response.status).toBe(200)
  const result=await response.json();expect(result.user).toMatchObject({role:'SAFETY_OFFICER',permissions:['safety.view','safety.decide']});expect(result).not.toHaveProperty('token')
  expect(seal).toHaveBeenCalledOnce()
 }finally{MOCK_USERS.pop();vi.unstubAllGlobals()}
})

// ── CS-10 Week 7: seven roles (Event Coordinator Lead + Safety Officer) ──────
// Expected cells are written out here independently of the production
// ACTION_ROLES table, so a guard that forgets a new role is caught.
describe('CS-10 Week 7 — seven-role permission matrix and landings', () => {
  const ALL_ROLES = ['EVENT_ORGANISER', 'EVENT_COORDINATOR', 'EVENT_COORDINATOR_LEAD', 'VENUE_STAFF', 'TECHNICAL_SUPPORT_STAFF', 'SAFETY_OFFICER', 'ATTENDEE']
  const MATRIX: Record<string, string[]> = {
    EVENT_ORGANISER: ['event_requests.create', 'events.view', 'messages.send'],
    EVENT_COORDINATOR: ['event_requests.review', 'events.confirm', 'events.view', 'messages.send', 'venues.view', 'venue_bookings.create', 'safety.submit', 'safety.rework', 'technical.submit', 'technical.view'],
    // Lead: supervision landing + read-only event views. No Coordinator powers (Q11).
    EVENT_COORDINATOR_LEAD: ['assignments.view', 'events.view', 'messages.send'],
    VENUE_STAFF: ['events.view', 'messages.send', 'venues.view', 'venues.manage', 'venue_bookings.decide'],
    TECHNICAL_SUPPORT_STAFF: ['users.view', 'users.manage', 'permissions.manage', 'settings.manage', 'audit.view', 'events.view', 'messages.send', 'venues.view', 'technical.view', 'technical.review'],
    // Safety Officer: Safety workspace only; no event/venue/equipment editing.
    SAFETY_OFFICER: ['safety.view', 'safety.decide', 'messages.send'],
    ATTENDEE: ['events.view', 'messages.send', 'attendance.register'],
  }

  it('TC-CS10-20 / TC-CS26-04 every role x every action matches the matrix, including the two new roles', async () => {
    const { hasPermission, ROLES } = await import('../../services/utils/role-policy.js')
    expect([...ROLES].sort()).toEqual([...ALL_ROLES].sort())
    expect(Object.keys(MATRIX).sort()).toEqual([...ALL_ROLES].sort())
    const actions = [...new Set(Object.values(MATRIX).flat())]
    for (const role of ALL_ROLES) for (const action of actions) {
      // Even with every capability granted, the role decides (catches over-permissive defaults).
      expect(hasPermission({ role, roles: [role], permissions: actions }, action), `${role}: ${action}`).toBe(MATRIX[role]!.includes(action))
    }
    // A Lead never gains Coordinator powers from Lead membership (TC-CS10-22).
    for (const action of ['event_requests.review', 'events.confirm', 'venue_bookings.create', 'venues.manage'])
      expect(hasPermission({ role: 'EVENT_COORDINATOR_LEAD', roles: ['EVENT_COORDINATOR_LEAD'], permissions: actions }, action)).toBe(false)
  })

  it('TC-CS10-20b default seeded permissions grant each new role exactly its matrix row', async () => {
    const defaults = (await import('../../services/utils/role-permissions.js')).default as Record<string, string[]>
    const { MOCK_ROLE_PERMISSIONS } = await import('../../frontend/server/utils/mockPermissions')
    expect([...defaults.EVENT_COORDINATOR_LEAD!].sort()).toEqual(['assignments.view', 'events.view'])
    expect([...defaults.SAFETY_OFFICER!].sort()).toEqual(['safety.decide', 'safety.view'])
    expect([...MOCK_ROLE_PERMISSIONS.EVENT_COORDINATOR_LEAD].sort()).toEqual(['assignments.view', 'events.view'])
  })

  it('TC-CS10-18 a Lead lands on /queue and a Safety Officer on /safety-checks', async () => {
    const { roleHome } = await import('../../frontend/lib/roles')
    expect(roleHome('EVENT_COORDINATOR_LEAD')).toBe('/queue')
    expect(roleHome('SAFETY_OFFICER')).toBe('/safety-checks')
    const { default: middleware } = await import('../../frontend/app/middleware/auth.global')
    authMiddlewareMocks.loggedIn.value = true
    for (const [role, home, permissions] of [['EVENT_COORDINATOR_LEAD', '/queue', ['assignments.view', 'events.view']], ['SAFETY_OFFICER', '/safety-checks', ['safety.view', 'safety.decide']]] as const) {
      authMiddlewareMocks.sessionUser.value = { id: role, email: `${role}@example.test`, name: role, role, roles: [role], permissions: [...permissions] }
      authMiddlewareMocks.navigateToLogin.mockClear()
      await middleware({ path: '/' } as never)
      expect(authMiddlewareMocks.navigateToLogin, role).toHaveBeenCalledWith(home)
    }
  })

  it('TC-CS10-18b the seeded Lead can obtain a sealed BFF session with its role and permissions', async () => {
    vi.stubGlobal('defineEventHandler', defineEventHandler); vi.stubGlobal('readBody', readBody); vi.stubGlobal('createError', createError)
    const seal = vi.fn(); vi.stubGlobal('setUserSession', seal)
    try {
      const { default: handler } = await import('../../frontend/server/api/auth.post')
      const app = createApp(); app.use('/api/auth', handler)
      const response = await toWebHandler(app)(new Request('http://localhost/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'lead@example.com', password: 'Password123!' }) }))
      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result.user).toMatchObject({ role: 'EVENT_COORDINATOR_LEAD', permissions: ['assignments.view', 'events.view'] })
      expect(result).not.toHaveProperty('token')
      expect(seal).toHaveBeenCalledOnce()
    } finally { vi.unstubAllGlobals() }
  })

  it('TC-CS10-19 / 22 / 23 new roles are refused Coordinator, venue and each other\'s pages by typed URL', async () => {
    const { default: middleware } = await import('../../frontend/app/middleware/auth.global')
    authMiddlewareMocks.loggedIn.value = true
    const cases: Array<[string, string[], string, boolean]> = [
      ['SAFETY_OFFICER', ['safety.view', 'safety.decide'], '/venue/V1', false],          // TC-CS10-19 venue editing
      ['SAFETY_OFFICER', ['safety.view', 'safety.decide'], '/requests/E1', false],       // TC-CS10-23 event editing
      ['SAFETY_OFFICER', ['safety.view', 'safety.decide'], '/queue', false],
      ['EVENT_COORDINATOR_LEAD', ['assignments.view', 'events.view'], '/requests/E1', false], // TC-CS10-22 no Coordinator review
      ['EVENT_COORDINATOR_LEAD', ['assignments.view', 'events.view'], '/venue', false],
      ['EVENT_COORDINATOR_LEAD', ['assignments.view', 'events.view'], '/safety-checks', false],
      ['EVENT_COORDINATOR_LEAD', ['assignments.view', 'events.view'], '/technical-requirements', false], // Technical Support review queue (renamed in PR 16)
      ['EVENT_COORDINATOR', ['event_requests.review', 'events.view'], '/queue', false],   // a Coordinator is not a Lead
      ['EVENT_COORDINATOR_LEAD', ['assignments.view', 'events.view'], '/queue', true],
      ['SAFETY_OFFICER', ['safety.view', 'safety.decide'], '/safety-checks', true],
    ]
    for (const [role, permissions, path, allowed] of cases) {
      authMiddlewareMocks.sessionUser.value = { id: role, email: `${role}@example.test`, name: role, role, roles: [role], permissions }
      authMiddlewareMocks.navigateToLogin.mockClear()
      await middleware({ path, meta: path === '/queue' ? { permission: 'assignments.view' } : path === '/safety-checks' ? { permission: 'safety.view' } : {} } as never)
      if (allowed) expect(authMiddlewareMocks.navigateToLogin, `${role} ${path}`).not.toHaveBeenCalled()
      else expect(authMiddlewareMocks.navigateToLogin, `${role} ${path}`).toHaveBeenCalledWith('/access-denied')
    }
  })

  it('TC-CS10-21 the new staff roles are refused by public sign-up at the BFF boundary', async () => {
    const { PUBLIC_ROLES } = await import('../../services/utils/role-policy.js')
    expect([...PUBLIC_ROLES].sort()).toEqual(['ATTENDEE', 'EVENT_ORGANISER'])
    for (const role of ['SAFETY_OFFICER', 'EVENT_COORDINATOR_LEAD']) expect(PUBLIC_ROLES).not.toContain(role)
  })
})
