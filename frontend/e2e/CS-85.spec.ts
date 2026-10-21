import {expect} from '@playwright/test'
import {test,session,emails,signIn,mutation} from './helpers'
import {createVenue,planningEvent,hold,roomInput,reviewDatabase,databaseEvidence} from './fixtures/venue-fixtures'
test('TC-CS85-31 LIVE repeated-hour closure blocks search, request and Staff approval with preserved PostgreSQL evidence',async({page,playwright,owner},info)=>{
  const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner,{proposedDate:'2028-11-05',startTime:'00:00',endTime:'06:00',timeZone:'America/New_York'})
  try{
    const hours=(closesAt:string)=>['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].map(weekday=>({weekday,isClosed:false,opensAt:'01:00',closesAt}))
    const venue=await createVenue(staff,{timeZone:'America/New_York',setupMinutes:0,turnaroundMinutes:0,operatingHours:hours('01:30')})
    const input={startAt:'2028-11-05T01:20:00-04:00',endAt:'2028-11-05T01:10:00-05:00',timeZone:'America/New_York'}
    const query='SELECT b.id,b.status,b.version,b."requestedStart",b."requestedEnd",b.flags,(SELECT count(*)::int FROM venue_booking_activity a WHERE a."bookingId"=b.id) AS activities,(SELECT count(*)::int FROM booking_outbox o WHERE o."aggregateId"=b.id) AS intents FROM venue_booking_requests b WHERE b."venueId"=$1 ORDER BY b.id'
    type StoredRoom={id:string;status:string;version:number;requestedStart:Date;requestedEnd:Date;flags:string[];activities:number;intents:number}
    const rows=async()=> (await reviewDatabase<{rows:StoredRoom[]}>('booking',db=>db.query(query,[venue.id]))).rows
    const search=await p.coordinator.get('/api/bookings/events/'+p.event.eventId+'/venue-search?'+new URLSearchParams({startAt:input.startAt,endAt:input.endAt}))
    expect(search.status()).toBe(200);expect((await search.json()).items.some((v:any)=>v.id===venue.id)).toBe(false)
    const denied=await mutation(p.coordinator,'POST','/api/bookings',roomInput(p.event.eventId,venue.id,input))
    expect(denied.status()).toBe(422);expect(JSON.stringify(await denied.json())).toContain('OUTSIDE_OPERATING_HOURS');expect(await rows()).toEqual([])
    async function changeHours(closesAt:string){
      const current=await (await staff.get('/api/venues/'+venue.id)).json()
      const changed=await mutation(staff,'PUT','/api/venues/'+venue.id+'/operating-hours',{items:hours(closesAt),version:current.version,reason:'Repeated-hour current operating limits'})
      expect(changed.status(),await changed.text()).toBe(200)
    }
    await changeHours('02:00')
    const room=await hold(p.coordinator,p.event.eventId,venue.id,input)
    expect(room.startAt).toBe('2028-11-05T05:20:00.000Z');expect(room.endAt).toBe('2028-11-05T06:10:00.000Z')
    await changeHours('01:30')
    await expect.poll(async()=>(await rows())[0]?.flags).toContain('OUTSIDE_OPERATING_HOURS')
    const before=await rows();expect(before).toHaveLength(1);expect(before[0].flags).toContain('OUTSIDE_OPERATING_HOURS')
    const refused=await mutation(staff,'PUT','/api/bookings/'+room.id+'/decision',{status:'CONFIRMED',version:before[0].version,reason:'Validate every occupied instant'})
    expect(refused.status()).toBe(422);expect(JSON.stringify(await refused.json())).toContain('OUTSIDE_OPERATING_HOURS');expect(await rows()).toEqual(before)
    await signIn(page,p.contact.email);await page.goto('/events/'+p.event.eventId)
    const card=page.locator(`[data-booking-id="${room.id}"]`)
    await expect(card).toContainText('outside operating hours');await expect(card).toContainText('tentatively held')
    await page.screenshot({path:info.outputPath('TC-CS85-31-current-hours-blocker.png'),fullPage:true})
    await info.attach('TC-CS85-31-network-results',{body:Buffer.from(JSON.stringify({caseId:'TC-CS85-31',venueId:venue.id,bookingId:room.id,searchStatus:search.status(),closedRequestStatus:denied.status(),staffApprovalStatus:refused.status(),input,storedBefore:before,storedAfter:await rows()},null,2)),contentType:'application/json'})
    await databaseEvidence(page,info,'TC-CS85-31',[{database:'booking_db',query,rows:before}])
    await changeHours('02:00')
    await expect.poll(async()=>(await rows())[0]?.flags).toEqual([])
    const current=(await rows())[0]
    const approved=await mutation(staff,'PUT','/api/bookings/'+room.id+'/decision',{status:'CONFIRMED',version:current.version,reason:'Complete repeated hour is now open'})
    expect(approved.status(),await approved.text()).toBe(200)
    const saved=await rows();expect(saved[0].status).toBe('CONFIRMED');expect(saved[0].flags).toEqual([])
    await page.goto('/events/'+p.event.eventId);await expect(page.locator(`[data-booking-id="${room.id}"]`)).toContainText('Venue approved')
    await page.screenshot({path:info.outputPath('TC-CS85-31-open-hours-approved.png'),fullPage:true})
    await databaseEvidence(page,info,'TC-CS85-31-open-hours',[{database:'booking_db',query,rows:saved}])
  }finally{await staff.dispose();await p.coordinator.dispose()}
})
test('TC-CS85-30 LIVE setup and turnaround preserve advertised time and protect the occupied window',async({page,playwright,owner},info)=>{
  const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
  try {
    const venue=await createVenue(staff),room=await hold(p.coordinator,p.event.eventId,venue.id)
    expect(room.startAt).toBe('2028-11-20T02:00:00.000Z');expect(room.occupiedStart).toBe('2028-11-20T01:30:00.000Z');expect(room.occupiedEnd).toBe('2028-11-20T04:45:00.000Z')
    const refused=await mutation(p.coordinator,'POST','/api/bookings',roomInput(p.event.eventId,venue.id,{title:'Competing room request',reason:'Must refuse turnaround overlap',startAt:'2028-11-20T04:30:00Z',endAt:'2028-11-20T05:00:00Z'}))
    expect(refused.status()).toBe(409);expect(JSON.stringify(await refused.json())).toContain(room.id)
    await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`)
    const card=page.locator(`[data-booking-id="${room.id}"]`)
    await expect(card).toContainText('Occupied, including setup and turnaround');await expect(card).toContainText('09:30');await expect(card).toContainText('12:45')
    await page.screenshot({path:info.outputPath('TC-CS85-30-current-occupied-window.png'),fullPage:true})
    const query='SELECT id,"requestedStart" AS "startAt","requestedEnd" AS "endAt","occupiedStart","occupiedEnd","setupMinutes","turnaroundMinutes" FROM venue_booking_requests WHERE id=$1'
    const rows=(await reviewDatabase('booking',async db=>db.query(query,[room.id]))).rows
    expect(rows[0].startAt.toISOString()).toBe(room.startAt)
    expect(rows[0].occupiedStart.toISOString()).toBe(room.occupiedStart)
    expect(rows[0].occupiedEnd.toISOString()).toBe(room.occupiedEnd)
    await databaseEvidence(page,info,'TC-CS85-30',[{database:'booking_db',query,rows}])
    const blockedVenue=await createVenue(staff)
    const closure=await mutation(staff,'POST','/api/bookings',roomInput(p.event.eventId,blockedVenue.id,{eventId:null,status:'UNAVAILABLE',title:'Access maintenance',startAt:'2028-11-20T01:00:00Z',endAt:'2028-11-20T01:45:00Z'}))
    expect(closure.status(),await closure.text()).toBe(200)
    const setupClash=await mutation(p.coordinator,'POST','/api/bookings',roomInput(p.event.eventId,blockedVenue.id,{reason:'Advertised 10:00 starts after the09:45 block; setup09:30 still clashes'}))
    expect(setupClash.status()).toBe(409);expect((await setupClash.json()).data.error.code).toBe('VENUE_CONFLICT')
    const blockedQuery='SELECT id,"eventId",status,"requestedStart","requestedEnd","occupiedStart","occupiedEnd" FROM venue_booking_requests WHERE "venueId"=$1'
    const blockedRows=(await reviewDatabase('booking',async db=>db.query(blockedQuery,[blockedVenue.id]))).rows
    expect(blockedRows).toHaveLength(1);expect(blockedRows[0].status).toBe('UNAVAILABLE');expect(blockedRows[0].eventId).toBeNull()
    await databaseEvidence(page,info,'TC-CS85-30-blocked-setup',[{database:'booking_db',query:blockedQuery,rows:blockedRows}])
    const boundaryVenue=await createVenue(staff,{setupMinutes:0,turnaroundMinutes:45})
    const firstBoundary=await hold(p.coordinator,p.event.eventId,boundaryVenue.id)
    const searchPath='/api/bookings/events/'+p.event.eventId+'/venue-search?startAt=2028-11-20T05%3A00%3A00Z&endAt=2028-11-20T06%3A00%3A00Z'
    const afterTurnaround=await (await p.coordinator.get(searchPath)).json()
    expect(afterTurnaround.items.some((x:any)=>x.id===boundaryVenue.id)).toBe(true)
    const overlap=await mutation(p.coordinator,'POST','/api/bookings',roomInput(p.event.eventId,boundaryVenue.id,{startAt:'2028-11-20T04:44:00Z',endAt:'2028-11-20T06:00:00Z'}))
    expect(overlap.status()).toBe(409);expect(JSON.stringify(await overlap.json())).toContain(firstBoundary.id)
    const touching=await hold(p.coordinator,p.event.eventId,boundaryVenue.id,{startAt:'2028-11-20T04:45:00Z',endAt:'2028-11-20T06:00:00Z'})
    expect(touching.occupiedStart).toBe(firstBoundary.occupiedEnd)
    const boundaryRows=(await reviewDatabase('booking',async db=>db.query(blockedQuery,[boundaryVenue.id]))).rows
    expect(boundaryRows).toHaveLength(2)
    await databaseEvidence(page,info,'TC-CS85-30-touching-boundary',[{database:'booking_db',query:blockedQuery,rows:boundaryRows}])
    const civil=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
    const monday=new Date(civil+'T00:00:00Z');monday.setUTCDate(monday.getUTCDate()+((8-monday.getUTCDay())%7||7))
    const nextMonday=monday.toISOString().slice(0,10),soon=await planningEvent(playwright.request,owner,{proposedDate:nextMonday})
    try{
      const calendarVenue=await createVenue(staff),startAt=nextMonday+'T02:00:00.000Z',endAt=nextMonday+'T04:00:00.000Z'
      const calendarRoom=await hold(soon.coordinator,soon.event.eventId,calendarVenue.id,{startAt,endAt})
      await signIn(page,emails.staff);await page.goto('/venue')
      await page.getByPlaceholder('Search venues...').fill(calendarVenue.name)
      await page.getByRole('button',{name:new RegExp(calendarVenue.name)}).click()
      await page.getByRole('button',{name:'Next range',exact:true}).click()
      const visibleRoom=page.getByRole('button').filter({hasText:calendarRoom.title})
      await expect(visibleRoom).toHaveCount(1);await expect(visibleRoom).toHaveAttribute('title',/Occupied: .*09:30.*12:45/)
      await expect(page.locator('[data-buffer="setup"]')).toHaveCount(1);await expect(page.locator('[data-buffer="turnaround"]')).toHaveCount(1)
      await visibleRoom.scrollIntoViewIfNeeded()
      await expect(visibleRoom).toBeInViewport();await expect(page.locator('[data-buffer="setup"]')).toBeInViewport();await expect(page.locator('[data-buffer="turnaround"]')).toBeInViewport()
      await page.screenshot({path:info.outputPath('TC-CS85-30-real-calendar-buffers.png'),fullPage:true})
      const calendarRows=(await reviewDatabase('booking',async db=>db.query(query,[calendarRoom.id]))).rows
      expect(calendarRows[0].occupiedStart.toISOString()).toBe(calendarRoom.occupiedStart);expect(calendarRows[0].occupiedEnd.toISOString()).toBe(calendarRoom.occupiedEnd)
      await databaseEvidence(page,info,'TC-CS85-30-real-calendar',[{database:'booking_db',query,rows:calendarRows}])
    }finally{await soon.coordinator.dispose()}
  }finally{await staff.dispose();await p.coordinator.dispose()}
})
