// Local display/intent types. CS-77 still owns the versioned server contract;
// these components neither grant a role nor change the parent Event lifecycle.
export const safetyAreas = {
  VENUE: 'Venue',
  TECHNICAL: 'Equipment / Technical',
  EVENT_DETAILS: 'Event details',
} as const
export type SafetyArea = keyof typeof safetyAreas
export type SafetyDecision = 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES'
export interface SafetyRound { id:string; number:number; requirementsRevision:string }
export interface SafetyDecisionIntent {
  roundId:string; round:number; requirementsRevision:string
  decision:SafetyDecision; reason:string; areas:SafetyArea[]
}
export interface SafetyVenue {
  bookingId:string; venueName:string; venueType?:string
  expectedAttendance:number | null; capacity:number | null; layout:string | null
  emergencyAccess:string | null; accessibilityNeeds:string[] | null
  equipmentPlacement:string | null; crowdMovement:string | null; restrictions:string | null
}
export interface SafetySnapshot {
  eventId:string; eventTitle:string; requirementsRevision?:string
  venues:SafetyVenue[]; equipmentStatus:'UNVERIFIED' | 'APPROVED' | 'NOT_REQUIRED'
  equipment:Array<{label:string; quantity:number}> | null
}
export interface SafetyFeedback {
  roundId:string; round:number; decision:'REJECT' | 'REQUEST_CHANGES'
  reason:string; affectedAreas:string[]
}
export interface ReworkArrangement { area:string; label:string; ready:boolean | null }

export function isSafetyArea(value:unknown): value is SafetyArea {
  return typeof value==='string' && Object.hasOwn(safetyAreas,value)
}
export function currentSafetyRound(round:SafetyRound | null | undefined,revision:string): round is SafetyRound {
  return Boolean(round && typeof round.id==='string' && round.id.trim()
    && Number.isSafeInteger(round.number) && round.number>0
    && typeof revision==='string' && revision.trim()
    && round.requirementsRevision===revision)
}
export function validateSafetyDecision(input:{decision:unknown; reason:unknown; areas:unknown},round:SafetyRound | null,revision:string) {
  const errors:Record<string,string>={}
  const validRound=currentSafetyRound(round,revision)
  if(!validRound)errors.round='Refresh the current Safety review before deciding.'
  const decision=typeof input.decision==='string'?input.decision:''
  if(!['APPROVE','REJECT','REQUEST_CHANGES'].includes(decision))errors.decision='Choose a Safety decision.'
  const reason=typeof input.reason==='string'?input.reason.trim():''
  if(['REJECT','REQUEST_CHANGES'].includes(decision) && !reason)errors.reason='Give a reason for this decision.'
  let areas:SafetyArea[]=[]
  if(decision==='REQUEST_CHANGES') {
    if(!Array.isArray(input.areas) || !input.areas.length)errors.areas='Select at least one affected area.'
    else if(!input.areas.every(isSafetyArea))errors.areas='Choose only the listed affected areas.'
    else areas=[...new Set(input.areas)]
  }
  const value:SafetyDecisionIntent | null=!validRound || Object.keys(errors).length?null:{
    roundId:round.id,round:round.number,requirementsRevision:revision,
    decision:decision as SafetyDecision,reason,areas,
  }
  return {errors,value}
}
export function reworkIsReady(feedback:SafetyFeedback | null,arrangements:ReworkArrangement[]) {
  if(!feedback || !Array.isArray(arrangements) || !['REJECT','REQUEST_CHANGES'].includes(feedback.decision)
    || !Array.isArray(feedback.affectedAreas) || !feedback.affectedAreas.length
    || !feedback.affectedAreas.every(isSafetyArea))return false
  return feedback.affectedAreas.every(area=>{
    const affected=arrangements.filter(item=>item.area===area)
    return affected.length>0 && affected.every(item=>item.ready===true)
  })
}
