import { recognisedRoles, roleHome } from '~~/lib/roles'
const PUBLIC_PAGES = ['/login', '/signup']

export default defineNuxtRouteMiddleware(async (to) => {
  if (PUBLIC_PAGES.includes(to.path)) return
  const { loggedIn, user, fetch: refreshSession } = useUserSession()
  if (!loggedIn.value) {
    try { await refreshSession() }
    catch { return navigateTo('/login') }
    if (!loggedIn.value) return navigateTo('/login')
  }
  if (to.path === '/access-denied') return
  const roles = recognisedRoles(user.value)
  if (!roles.length) return navigateTo('/access-denied')
  if (to.path === '/') {
    const home = roleHome(user.value?.role ?? roles[0]!)
    if (home !== '/') return navigateTo(home)
  }
  const { can } = usePermissions()
  if (to.meta?.permission && !can(to.meta.permission)) return navigateTo('/access-denied')
  if (to.path.startsWith('/requests/') || to.path.startsWith('/events/')) {
    if (!roles.some(role => role === 'EVENT_ORGANISER' || role === 'EVENT_COORDINATOR')) return navigateTo('/access-denied')
  }
  if (to.path === '/venue' || to.path.startsWith('/venue/')) {
    if (!roles.some(role => ['EVENT_COORDINATOR', 'VENUE_STAFF', 'TECHNICAL_SUPPORT_STAFF'].includes(role))) return navigateTo('/access-denied')
  }
  if (to.path === '/support' && !roles.includes('TECHNICAL_SUPPORT_STAFF')) return navigateTo('/access-denied')
  if (to.path === '/attendee' && !roles.includes('ATTENDEE')) return navigateTo('/access-denied')
})
