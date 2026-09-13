import type { LoginResponse } from '../app/lib/auth'
import type { EventsResponse, EventStatus, OrganiserEvent } from '../app/lib/events'

let seq = 0

/** Build an event with unique copy so tests never depend on mock rows. */
export function makeEvent(overrides: Partial<OrganiserEvent> & { status: EventStatus }): OrganiserEvent {
  seq += 1
  return {
    id: `test-event-${seq}`,
    category: 'TEST CATEGORY',
    title: `Test Event ${seq}`,
    meta: `Test meta ${seq}`,
    ...overrides,
  }
}

/** One event per status — covers every tab and badge mapping. */
export function makeFullDataset(): OrganiserEvent[] {
  const statuses: EventStatus[] = [
    'draft',
    'submitted',
    'under-review',
    'confirmed',
    'planning',
    'completed',
    'rejected',
  ]
  return statuses.map(status => makeEvent({ status }))
}

export function makeEventsResponse(events: OrganiserEvent[] = makeFullDataset()): EventsResponse {
  return { events }
}

export function makeUser(overrides: Partial<LoginResponse['user']> = {}): LoginResponse['user'] {
  seq += 1
  return {
    id: `test-user-${seq}`,
    email: `user${seq}@example.com`,
    name: 'Test Organiser',
    role: 'organiser',
    ...overrides,
  }
}

export function makeLoginResponse(email = `user${seq + 1}@example.com`): LoginResponse {
  return { user: makeUser({ email }), token: `test-token-${seq}` }
}

export function resetFactorySeq() {
  seq = 0
}
