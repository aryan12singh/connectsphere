import type { EventRequestRecord } from '../api/events.post'
import type { OrganiserEvent } from '../api/events.get'
import { listRequestRecords } from './eventRequestStore'

/**
 * Seed request rows: complete records (same shape the BFF persists) so the
 * dashboard, detail reads and the edit form all share one data source.
 * Deterministic (fixed timestamps) for tests and screenshots.
 */
export interface SeedRequest extends EventRequestRecord {
  category: string
}

export const SEED_REQUESTS: SeedRequest[] = [
  {
    id: 'e1',
    organiserId: 'u-organiser',
    category: 'CORPORATE EVENT',
    status: 'DRAFT',
    submittedAt: null,
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
    coordinatorId: null,
    eventName: 'Product Summit Launch',
    purpose: 'Product launch',
    description: 'Annual gathering for customers and partners.',
    proposedDate: '2026-11-20',
    expectedAttendance: 300,
    startTime: '09:00',
    endTime: '17:00',
    timeZone: 'Asia/Singapore',
    minimumCapacity: 300,
    preferredLayout: 'theatre',
    venueType: 'physical',
    venueRequirements: 'Riverside Hall',
    accessibilityNeeds: ['wheelchair'],
    accessibilityDetails: '',
    equipmentNeeds: ['projector'],
    technicalDetails: '',
  },
  {
    id: 'e2',
    organiserId: 'u-organiser',
    category: 'CORPORATE EVENT',
    status: 'SUBMITTED',
    submittedAt: '2026-09-10T09:00:00.000Z',
    createdAt: '2026-09-08T09:00:00.000Z',
    updatedAt: '2026-09-10T09:00:00.000Z',
    coordinatorId: 'u-coordinator',
    eventName: 'Autumn Product Summit',
    purpose: 'Product launch',
    description: 'Flagship autumn summit for enterprise customers.',
    proposedDate: '2026-10-14',
    expectedAttendance: 220,
    startTime: '09:00',
    endTime: '17:00',
    timeZone: 'Asia/Singapore',
    minimumCapacity: 220,
    preferredLayout: 'theatre',
    venueType: 'physical',
    venueRequirements: 'Riverside Hall',
    accessibilityNeeds: ['wheelchair', 'hearing-loop'],
    accessibilityDetails: '',
    equipmentNeeds: ['projector', 'pa-system'],
    technicalDetails: '',
  },
  {
    id: 'e3',
    organiserId: 'u-organiser',
    category: 'GALA DINNER',
    status: 'APPROVED',
    submittedAt: '2026-09-05T09:00:00.000Z',
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-12T09:00:00.000Z',
    coordinatorId: 'u-coordinator',
    eventName: 'Riverside Hall Gala',
    purpose: 'Gala dinner',
    description: 'Black-tie gala for partners and sponsors.',
    proposedDate: '2026-11-02',
    expectedAttendance: 180,
    startTime: '18:00',
    endTime: '23:00',
    timeZone: 'Asia/Singapore',
    minimumCapacity: 180,
    preferredLayout: 'banquet',
    venueType: 'physical',
    venueRequirements: 'Riverside Hall',
    accessibilityNeeds: [],
    accessibilityDetails: '',
    equipmentNeeds: ['staging', 'pa-system'],
    technicalDetails: '',
  },
  {
    id: 'e4',
    organiserId: 'u-organiser',
    category: 'TRADE SHOW',
    status: 'SUBMITTED',
    submittedAt: '2026-09-15T09:00:00.000Z',
    createdAt: '2026-09-14T09:00:00.000Z',
    updatedAt: '2026-09-15T09:00:00.000Z',
    coordinatorId: 'u-coordinator',
    eventName: 'Vendor Expo 2026',
    purpose: 'Trade show',
    description: 'Two-day vendor exposition for the regional ecosystem.',
    proposedDate: '2026-12-05',
    expectedAttendance: 400,
    startTime: '10:00',
    endTime: '18:00',
    timeZone: 'Asia/Singapore',
    minimumCapacity: 400,
    preferredLayout: 'classroom',
    venueType: 'physical',
    venueRequirements: 'Oakview Pavilion',
    accessibilityNeeds: ['wheelchair'],
    accessibilityDetails: '',
    equipmentNeeds: ['projector', 'live-streaming'],
    technicalDetails: '',
  },
  {
    id: 'e5',
    organiserId: 'u-organiser',
    category: 'INTERNAL MEETING',
    status: 'RETURNED_FOR_AMENDMENT',
    submittedAt: '2026-09-12T09:00:00.000Z',
    createdAt: '2026-09-10T09:00:00.000Z',
    updatedAt: '2026-09-16T09:00:00.000Z',
    coordinatorId: 'u-coordinator',
    eventName: 'Q3 Townhall',
    purpose: 'Internal meeting',
    description: 'Quarterly company-wide town hall.',
    proposedDate: '2026-09-20',
    expectedAttendance: 120,
    startTime: '14:00',
    endTime: '16:00',
    timeZone: 'Asia/Singapore',
    minimumCapacity: 120,
    preferredLayout: 'theatre',
    venueType: 'physical',
    venueRequirements: 'The Grainhouse',
    accessibilityNeeds: [],
    accessibilityDetails: '',
    equipmentNeeds: ['pa-system'],
    technicalDetails: '',
  },
  {
    id: 'e6',
    organiserId: 'u-organiser',
    category: 'CHARITY EVENT',
    status: 'REJECTED',
    submittedAt: '2026-09-08T09:00:00.000Z',
    createdAt: '2026-09-05T09:00:00.000Z',
    updatedAt: '2026-09-09T09:00:00.000Z',
    coordinatorId: null,
    eventName: 'Winter Charity Ball',
    purpose: 'Charity fundraiser',
    description: 'Winter ball supporting local charities.',
    proposedDate: '2026-12-18',
    expectedAttendance: 150,
    startTime: '18:00',
    endTime: '23:00',
    timeZone: 'Asia/Singapore',
    minimumCapacity: 150,
    preferredLayout: 'banquet',
    venueType: 'physical',
    venueRequirements: 'Riverside Hall',
    accessibilityNeeds: ['wheelchair'],
    accessibilityDetails: '',
    equipmentNeeds: [],
    technicalDetails: '',
  },
]

/** Dashboard line derived from record data — homepage stays in sync. */
export function describeEvent(record: Pick<EventRequestRecord, 'proposedDate' | 'startTime' | 'venueRequirements' | 'venueType' | 'expectedAttendance'>): string {
  const date = record.proposedDate
    ? `${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${record.proposedDate}T00:00:00`))}${record.startTime ? `, ${record.startTime}` : ''}`
    : 'Date TBC'
  const venue = record.venueRequirements || record.venueType || 'Venue TBC'
  const capacity = record.expectedAttendance > 0 ? `${record.expectedAttendance} capacity` : 'Capacity TBC'
  return `${date} · ${venue} · ${capacity}`
}

/** Dashboard rows derived live from records — writes stay visible. */
export function createEventsResponse(): { events: OrganiserEvent[] } {
  return {
    events: listRequestRecords().map(record => ({
      id: record.id,
      category: (record as Partial<SeedRequest>).category ?? 'CUSTOM EVENT',
      title: record.eventName,
      meta: describeEvent(record),
      status: record.status,
    })),
  }
}
