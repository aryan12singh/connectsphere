// Mock-mode permissions (NUXT_AUTH_MODE=mock). A copy of the backend's
// default role → permission table in
// services/auth-service/prisma/migrations/20260928130000_admin_rbac_settings.
// In live mode the real, editable permissions come from auth-service instead.
import type { BackendRole } from './mockUserDb'

export const MOCK_ROLE_PERMISSIONS: Record<BackendRole, string[]> = {
  SAFETY_OFFICER: ['safety.view', 'safety.decide'],
  EVENT_COORDINATOR_LEAD: ['assignments.view', 'events.view'],
  TECHNICAL_SUPPORT_STAFF: ['technical.view', 'technical.review', 'venues.view', 'audit.view', 'permissions.manage', 'settings.manage', 'users.manage', 'users.view'],
  EVENT_ORGANISER: ['event_requests.create', 'events.view', 'messages.send'],
  EVENT_COORDINATOR: ['safety.submit', 'safety.rework', 'technical.submit', 'technical.view', 'event_requests.review', 'events.confirm', 'events.view', 'messages.send', 'venue_bookings.create', 'venues.view'],
  VENUE_STAFF: ['events.view', 'messages.send', 'venue_bookings.decide', 'venues.manage', 'venues.view'],
  ATTENDEE: ['attendance.register', 'events.view'],
}
