export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login')
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

  // Role gate: only organisers (Your events) and coordinators (review queue)
  // may use the app for now. Role is server-issued session data, and every
  // BFF route enforces the same rule — this is only the interface redirect.
  const role = user.value?.role
  if (role !== 'EVENT_ORGANISER' && role !== 'EVENT_COORDINATOR')
    return navigateTo('/login')
})
