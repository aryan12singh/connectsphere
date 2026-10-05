export type VenueType = 'PHYSICAL' | 'VIRTUAL' | 'HYBRID'

export interface OperatingHour {
  id?: string
  weekday: string
  isClosed: boolean
  opensAt: string
  closesAt: string
}

export interface VenueFormState {
  name: string
  address: string
  capacity: number | string
  venueType: VenueType
  supportedLayouts: string[]
  facilities: string[]
  accessibilityTags: string[]
  timeZone: string
  isActive: boolean
  managedById: string
  /** The existing Figma “Reason or note” field, required by the venue API. */
  reason: string
  operatingHours: OperatingHour[]
}

export const OPERATING_WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const

function defaultOperatingHours(): OperatingHour[] {
  return OPERATING_WEEKDAYS.map(weekday => ({
    weekday,
    isClosed: weekday === 'SATURDAY' || weekday === 'SUNDAY',
    opensAt: weekday === 'SATURDAY' || weekday === 'SUNDAY' ? '' : '09:00',
    closesAt: weekday === 'SATURDAY' || weekday === 'SUNDAY' ? '' : '17:00',
  }))
}

export function operatingSchedule(hours: OperatingHour[]) {
  const openHours = hours.filter(hour => !hour.isClosed)
  return {
    weekdays: openHours.map(hour => hour.weekday),
    opensAt: openHours[0]?.opensAt ?? '',
    closesAt: openHours[0]?.closesAt ?? '',
  }
}

/** Applies the Figma shared-time control back to the API's per-day records. */
export function applyOperatingSchedule(hours: OperatingHour[], weekdays: string[], opensAt: string, closesAt: string): OperatingHour[] {
  const activeDays = new Set(weekdays)
  return OPERATING_WEEKDAYS.map(weekday => {
    const current = hours.find(hour => hour.weekday === weekday)
    const isClosed = !activeDays.has(weekday)
    return { ...current, weekday, isClosed, opensAt: isClosed ? '' : opensAt, closesAt: isClosed ? '' : closesAt }
  })
}

export function createVenueForm(input: Partial<VenueFormState> = {}): VenueFormState {
  const form: VenueFormState = {
    name: '',
    address: '',
    capacity: '',
    venueType: 'PHYSICAL',
    supportedLayouts: [],
    facilities: [],
    accessibilityTags: [],
    timeZone: 'Asia/Singapore',
    isActive: true,
    managedById: '',
    reason: '',
    operatingHours: defaultOperatingHours(),
    ...input,
  }
  form.supportedLayouts = [...(input.supportedLayouts ?? [])]
  form.facilities = [...(input.facilities ?? [])]
  form.accessibilityTags = [...(input.accessibilityTags ?? [])]
  form.operatingHours = (input.operatingHours ?? defaultOperatingHours()).map(hour => ({ ...hour, opensAt: hour.opensAt ?? '', closesAt: hour.closesAt ?? '' }))
  return form
}

export function venuePayload(form: VenueFormState, fallbackManagedById: string) {
  return {
    name: form.name.trim(),
    address: form.address.trim(),
    capacity: form.capacity,
    venueType: form.venueType,
    supportedLayouts: form.supportedLayouts,
    facilities: form.facilities,
    accessibilityTags: form.accessibilityTags,
    timeZone: form.timeZone.trim(),
    isActive: form.isActive,
    managedById: form.managedById || fallbackManagedById,
    reason: form.reason.trim(),
    operatingHours: form.operatingHours.map(hour => ({ ...hour })),
  }
}
