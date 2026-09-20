export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login')
    return

  const { loggedIn, fetch: refreshSession } = useUserSession()

  if (loggedIn.value)
    return

  try {
    await refreshSession()
  }
  catch {
    return navigateTo('/login')
  }

  if (!loggedIn.value)
    return navigateTo('/login')
})
