declare module '#auth-utils' {
  // Visible to the browser (useUserSession().user). Never put secrets here.
  interface User {
    id: string
    email: string
    name: string
    role: string
    roles?: string[]
    organisationId?: string | null
    // What this user may do, e.g. ["events.view", "users.manage"]. Used only
    // to show/hide UI — the backend checks permissions on every request.
    permissions: string[]
  }

  // Server-only part of the session. nuxt-auth-utils never sends `secure`
  // to the browser, so the backend session token lives here.
  interface SecureSessionData {
    token: string
  }
}

export {}
