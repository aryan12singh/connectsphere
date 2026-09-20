// Mock backend — mirrors docs/erd/schema.cs10-cs11.prisma User table 1:1. No validation, no mapping.
export type BackendRole = 'EVENT_ORGANISER' | 'EVENT_COORDINATOR' | 'VENUE_STAFF' | 'ATTENDEE' | 'TECHNICAL_SUPPORT_STAFF'

export interface DbUser {
  id: string
  email: string
  passwordHash: string // plain for mock; real hashes later
  firstName: string
  lastName: string
  role: BackendRole
  createdAt: string
}

export const MOCK_USERS: DbUser[] = [
  { id: 'u-organiser', email: 'organiser@example.com', passwordHash: 'Password123!', firstName: 'Organiser', lastName: 'One', role: 'EVENT_ORGANISER', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'u-coordinator', email: 'coordinator@example.com', passwordHash: 'Password123!', firstName: 'Coordinator', lastName: 'One', role: 'EVENT_COORDINATOR', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'u-venue', email: 'venue@example.com', passwordHash: 'Password123!', firstName: 'Venue', lastName: 'Staff', role: 'VENUE_STAFF', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'u-attendee', email: 'attendee@example.com', passwordHash: 'Password123!', firstName: 'Attendee', lastName: 'One', role: 'ATTENDEE', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'u-admin', email: 'tech@example.com', passwordHash: 'Password123!', firstName: 'Tech', lastName: 'Support', role: 'TECHNICAL_SUPPORT_STAFF', createdAt: '2026-01-01T00:00:00.000Z' },
]

export function findUserByEmail(email: string): DbUser | undefined {
  return MOCK_USERS.find(u => u.email.toLowerCase() === email.toLowerCase())
}

export function verifyPassword(user: DbUser, password: string): boolean {
  return user.passwordHash === password
}
