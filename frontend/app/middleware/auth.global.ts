// Pages anyone can open without logging in.
const PUBLIC_PAGES = ['/login', '/signup']

export default defineNuxtRouteMiddleware(async (to) => {
  if (PUBLIC_PAGES.includes(to.path))
    return

  const { loggedIn, user, fetch: refreshSession } = useUserSession()

  if (!loggedIn.value) {
    try {
      await refreshSession()
    }
    catch {
      return navigateTo('/login')
    }

    if (!loggedIn.value)
      return navigateTo('/login')
  }

  // (The backend session itself is re-checked once per page load by
  // app/plugins/verify-session.client.ts.)

  // Pages that declare a permission — definePageMeta({ permission: 'users.view' })
  // — are allowed by that permission alone. The backend enforces it again on
  // every API call; this only avoids showing a page that would fail.
  const required = to.meta?.permission
  if (required) {
    const { can } = usePermissions()
    if (!can(required))
      return navigateTo('/')
    return
  }

  // Role gate: only organisers (Your events) and coordinators (review queue)
  // may use the app for now. Role is server-issued session data, and every
  // BFF route enforces the same rule — this is only the interface redirect.
  const role = user.value?.role
  if (role !== 'EVENT_ORGANISER' && role !== 'EVENT_COORDINATOR')
    return navigateTo('/login')
})
