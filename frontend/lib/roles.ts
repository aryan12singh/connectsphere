export const ROLE_LABELS = {
  EVENT_ORGANISER: 'Organiser',
  EVENT_COORDINATOR: 'Coordinator',
  VENUE_STAFF: 'Venue Staff',
  TECHNICAL_SUPPORT_STAFF: 'Technical Support',
  ATTENDEE: 'Attendee',
} as const
export type Role = keyof typeof ROLE_LABELS
export function recognisedRoles(user: { role?: string, roles?: string[] } | null | undefined): Role[] {
  const roles = user?.roles ?? (user?.role ? [user.role] : [])
  if (!Array.isArray(roles) || roles.some(role => !Object.hasOwn(ROLE_LABELS, role))) return []
  return [...new Set(roles)] as Role[]
}
export function roleHome(role: string) {
  return ({ VENUE_STAFF: '/venue', ATTENDEE: '/attendee', TECHNICAL_SUPPORT_STAFF: '/support' } as Record<string, string>)[role] ?? '/'
}
