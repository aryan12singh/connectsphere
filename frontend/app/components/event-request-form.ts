/** Shared form state between the create page and the detail page (reusable form). */
export interface RequestFormState {
  eventName: string
  purpose: string
  description: string
  proposedDate: string
  expectedAttendance: string
  startTime: string
  endTime: string
  timeZone: string
  minimumCapacity: string
  preferredLayout: string
  venueType: string
  venueRequirements: string
  accessibilityDetails: string
  technicalDetails: string
  accessibilityNeeds: Record<string, boolean>
  equipmentNeeds: Record<string, boolean>
}

export const ACCESSIBILITY_OPTIONS = [
  'Wheelchair accessible entrance & seating',
  'Hearing loop / assisted listening',
  'Accessible restrooms nearby',
  'No known accessibility needs',
  'Other accessibility needs',
]

export const EQUIPMENT_OPTIONS = [
  'Projector & screen',
  'PA system & microphones',
  'Staging / podium',
  'Live streaming setup',
  'No equipment required',
  'Other equipment / technical need',
]

export function emptyRequestForm(): RequestFormState {
  return {
    eventName: '',
    purpose: '',
    description: '',
    proposedDate: '',
    expectedAttendance: '',
    startTime: '',
    endTime: '',
    timeZone: '',
    minimumCapacity: '',
    preferredLayout: '',
    venueType: '',
    venueRequirements: '',
    accessibilityDetails: '',
    technicalDetails: '',
    accessibilityNeeds: {},
    equipmentNeeds: {},
  }
}

function checkedOptions(selected: Record<string, boolean>, options: string[]) {
  return options.filter(option => selected[option])
}

/** Serializes form state to the BFF wire shape (shared by create + edit). */
export function formToPayload(form: RequestFormState, extra: Record<string, unknown> = {}) {
  return {
    eventName: form.eventName,
    purpose: form.purpose,
    description: form.description,
    proposedDate: form.proposedDate,
    expectedAttendance: form.expectedAttendance === '' ? null : Number(form.expectedAttendance),
    startTime: form.startTime,
    endTime: form.endTime,
    timeZone: form.timeZone,
    minimumCapacity: form.minimumCapacity === '' ? null : Number(form.minimumCapacity),
    preferredLayout: form.preferredLayout,
    venueType: form.venueType,
    venueRequirements: form.venueRequirements,
    accessibilityNeeds: checkedOptions(form.accessibilityNeeds, ACCESSIBILITY_OPTIONS),
    accessibilityDetails: form.accessibilityDetails,
    equipmentNeeds: checkedOptions(form.equipmentNeeds, EQUIPMENT_OPTIONS),
    technicalDetails: form.technicalDetails,
    ...extra,
  }
}
