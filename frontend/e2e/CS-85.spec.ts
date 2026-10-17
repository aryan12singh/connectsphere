import {expect} from '@playwright/test'
import {test,session,emails,signIn,mutation} from './helpers'
import {createVenue,planningEvent,hold,roomInput,reviewDatabase,databaseEvidence} from './venue-fixtures'
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
      await signIn(page,soon.contact.email);await page.goto('/venue/'+calendarVenue.id)
      await page.getByRole('button',{name:'Next range',exact:true}).click()
      const visibleRoom=page.getByRole('button').filter({hasText:calendarRoom.title})
      await expect(visibleRoom).toHaveCount(1);await expect(visibleRoom).toHaveAttribute('title',/Occupied: .*09:30.*12:45/)
      await expect(page.locator('[data-buffer="setup"]')).toHaveCount(1);await expect(page.locator('[data-buffer="turnaround"]')).toHaveCount(1)
      await page.screenshot({path:info.outputPath('TC-CS85-30-real-calendar-buffers.png'),fullPage:true})
      const calendarRows=(await reviewDatabase('booking',async db=>db.query(query,[calendarRoom.id]))).rows
      expect(calendarRows[0].occupiedStart.toISOString()).toBe(calendarRoom.occupiedStart);expect(calendarRows[0].occupiedEnd.toISOString()).toBe(calendarRoom.occupiedEnd)
      await databaseEvidence(page,info,'TC-CS85-30-real-calendar',[{database:'booking_db',query,rows:calendarRows}])
    }finally{await soon.coordinator.dispose()}
  }finally{await staff.dispose();await p.coordinator.dispose()}
})
