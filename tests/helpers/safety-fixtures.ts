// Explicit component projections; not a delivered Safety/technical API.
export function safetySnapshot() {
  return {
    eventId:'event-1',eventTitle:'Conference',requirementsRevision:'requirements-4',
    equipmentStatus:'UNVERIFIED',equipment:[],
    venues:[
      {bookingId:'room-a',venueName:'Main hall',venueType:'PHYSICAL',expectedAttendance:80,capacity:80,layout:'THEATRE',emergencyAccess:'East emergency exit',accessibilityNeeds:['Wheelchair accessible entrance'],equipmentPlacement:'Stage left',crowdMovement:'Separate entrance and exit',restrictions:'Keep the emergency route clear'},
      {bookingId:'room-b',venueName:'Breakout room',venueType:'PHYSICAL',expectedAttendance:41,capacity:40,layout:'CLASSROOM',emergencyAccess:null,accessibilityNeeds:[],equipmentPlacement:null,crowdMovement:null,restrictions:null},
    ],
  }
}
export const reviewRound=()=>({id:'round-1',number:1,requirementsRevision:'requirements-4'})
export function reworkProps() {
  return {
    feedback:{roundId:'round-1',round:1,decision:'REQUEST_CHANGES',reason:'The exit is obstructed',affectedAreas:['VENUE']},
    arrangements:[{area:'VENUE',label:'Main hall',ready:false},{area:'TECHNICAL',label:'Projector support',ready:true},{area:'EVENT_DETAILS',label:'Event details',ready:true}],
    currentRequirementsRevision:'requirements-5',readinessRequirementsRevision:'requirements-5',
    canViewFeedback:true,canResubmit:false,
  }
}
