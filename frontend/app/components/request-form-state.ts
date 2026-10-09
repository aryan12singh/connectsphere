/** Shared form state between the create page and the detail page (reusable form). */
export interface RequestFormState {
  eventName: string
  purpose: string
  description: string
  proposedDate: string
  endDate: string
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
  registrationEnabled: boolean
  registrationOpensAt: string
  registrationClosesAt: string
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
    endDate: '',
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
    registrationEnabled: false,
    registrationOpensAt: '',
    registrationClosesAt: '',
  }
}

function checkedOptions(selected: Record<string, boolean>, options: string[]) {
  return Object.keys(selected).filter(option => selected[option])
}

/** Serializes form state to the BFF wire shape (shared by create + edit). */
export function formToPayload(form: RequestFormState, extra: Record<string, unknown> = {}) {
  return {
    registrationEnabled: form.registrationEnabled,
    registrationOpensAt: form.registrationOpensAt || null,
    registrationClosesAt: form.registrationClosesAt || null,
    eventName: form.eventName,
    purpose: form.purpose,
    description: form.description,
    proposedDate: form.proposedDate,
    endDate: form.endDate,
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

/** Includes values not in today's checkbox labels when reopening older records. */
export function recordToForm(source: Record<string, unknown>): RequestFormState {
 const f=emptyRequestForm()
 for(const key of Object.keys(f) as (keyof RequestFormState)[]) {
  const value=source[key]
  if(key==='accessibilityNeeds'||key==='equipmentNeeds')f[key]=Object.fromEntries((Array.isArray(value)?value:[]).filter(x=>typeof x==='string').map(x=>[x,true]))
  else if(key==='registrationEnabled')f[key]=value===true
  else if(key==='expectedAttendance'||key==='minimumCapacity')f[key]=typeof value==='number'&&value>0?String(value):''
  else if(key==='registrationOpensAt'||key==='registrationClosesAt'){
   if(typeof value==='string'&&value&&source.timeZone&&!Number.isNaN(new Date(value).getTime())){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:String(source.timeZone),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));f[key]=`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`}
  }
  else f[key]=typeof value==='string'?value:''
 }
 return f
}
export function hasMeaningfulInput(form:RequestFormState) {
 return Object.entries(form).some(([k,v])=>k!=='registrationEnabled'&&(typeof v==='object'?Object.values(v).some(Boolean):typeof v==='string'&&v.trim().length>0))
}
