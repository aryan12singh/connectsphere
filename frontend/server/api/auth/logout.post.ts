export default defineEventHandler((event) => {
  deleteCookie(event, 'connectsphere_session', { path: '/' })
  return { ok: true }
})
