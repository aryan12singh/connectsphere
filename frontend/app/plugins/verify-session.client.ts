/**
 * Runs once when the app loads in the browser (a full page load or refresh).
 *
 * If the user has a login cookie, ask the BFF whether the backend session is
 * still alive (GET /api/auth/me). That call also picks up role/permission
 * changes made by tech support. If the backend says the session is over
 * (expired, idle, logged out elsewhere, account disabled), log out here too.
 *
 * In mock mode /api/auth/me just returns the session user, so this is a no-op.
 */
export default defineNuxtPlugin(async () => {
  const { loggedIn, fetch: refreshSession, clear: clearSession } = useUserSession()
  if (!loggedIn.value)
    return

  try {
    await $fetch('/api/auth/me')
    await refreshSession() // cookie may have new role/permissions
  }
  catch (error) {
    // Only a 401 means "session over". Other errors (e.g. a network blip)
    // leave the user logged in; the next backend call will tell.
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) {
      await clearSession()
      await navigateTo('/login')
    }
  }
})
