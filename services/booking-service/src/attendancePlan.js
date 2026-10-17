// Attendance applies to simultaneous room use, never the sum across a day.
function attendancePlan(context,rooms) {
  const expectedAttendance=context?.expectedAttendance;
  const required=rooms.filter(r=>r.required && r.status!=='CANCELLED');
  const points=[...new Set(required.flatMap(r=>[Date.parse(r.startAt),Date.parse(r.endAt)]))].sort((a,b)=>a-b);
  const sessions=[];
  for(let i=0;i<points.length-1;i++){
    const start=points[i],end=points[i+1];
    const active=required.filter(r=>Date.parse(r.startAt)<end && Date.parse(r.endAt)>start);
    if(!active.length)continue; // Unbooked Event gaps may be breaks/travel, not room sessions.
    const valid=active.every(r=>Number.isSafeInteger(r.expectedAttendance) && r.expectedAttendance>0);
    const allocated=valid?active.reduce((n,r)=>n+r.expectedAttendance,0):null;
    const reason=!Number.isSafeInteger(expectedAttendance) || expectedAttendance<1 || !valid?'ATTENDANCE_ALLOCATION_UNVERIFIED':allocated<expectedAttendance?'ATTENDANCE_ALLOCATION_INCOMPLETE':allocated>expectedAttendance?'ATTENDANCE_ALLOCATION_EXCEEDS_EVENT':null;
    sessions.push({startAt:new Date(start).toISOString(),endAt:new Date(end).toISOString(),bookingIds:active.map(r=>r.id),allocated,reason});
  }
  return {expectedAttendance:expectedAttendance ?? null,ready:sessions.length>0 && sessions.every(s=>!s.reason),sessions};
}
module.exports={attendancePlan};
