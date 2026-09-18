export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login')
    return

  try {
    const requestFetch = useRequestFetch()
    await requestFetch('/api/auth/session')
  }
  catch {
    return navigateTo('/login')
  }
})
