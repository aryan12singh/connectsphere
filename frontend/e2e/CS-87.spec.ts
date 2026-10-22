import {test,created,validRequest,assignedSession,session,emails,mutation,signIn} from './helpers'
import {expect} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {reviewDatabase,databaseEvidence} from './fixtures/venue-fixtures'

test('TC-CS87-13 LIVE Coordinator changes only the selected breakout and Staff can extend its hold',async({page,browser,playwright,owner},testInfo)=>{
  const submitted=await created(owner,'submit',validRequest({expectedAttendance:80,minimumCapacity:80,accessibilityNeeds:[]})),coordinator=await assignedSession(playwright.request,owner,submitted.id),staff=await session(playwright.request,emails.staff),staffPage=await browser.newPage()
  try {
    const contact=await (await owner.get(`/api/events/${submitted.id}/coordinator`)).json(),approved=await mutation(coordinator,'POST',`/api/events/${submitted.id}/decision`,{decision:'approve',version:submitted.version})
    expect(approved.status()).toBe(200);const event=await approved.json(),suffix=randomUUID(),venues=[]
    for(let i=0;i<3;i++){
      const r=await mutation(staff,'POST','/api/venues',{name:`Room change ${i} ${suffix}`,address:'Synthetic review venue',capacity:120,venueType:'PHYSICAL',supportedLayouts:['THEATRE','CLASSROOM'],facilities:['PROJECTOR'],accessibilityTags:[],timeZone:'Asia/Singapore',managedById:'a1000000-0000-4000-8000-000000000008',reason:'Isolated room-change fixture',setupMinutes:30,turnaroundMinutes:30,operatingHours:['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].map(weekday=>({weekday,isClosed:false,opensAt:'08:00',closesAt:'20:00'}))})
      expect(r.status()).toBe(200);venues.push(await r.json())
    }
    const rooms=[]
    for(let i=0;i<2;i++){
      const r=await mutation(coordinator,'POST','/api/bookings',{eventId:event.eventId,venueId:venues[i].id,title:i?'Main room':'Small breakout',reason:'Conference spaces',startAt:'2028-11-20T02:00:00.000Z',endAt:'2028-11-20T04:00:00.000Z',timeZone:'Asia/Singapore',expectedAttendance:i?80:40,layout:i?'THEATRE':'CLASSROOM',facilities:['PROJECTOR']})
      expect(r.status()).toBe(200);rooms.push(await r.json())
    }
    await signIn(page,contact.email);await page.goto(`/events/${event.eventId}`)
    await page.locator(`[data-booking-id="${rooms[0].id}"]`).getByRole('button',{name:'Find alternatives',exact:true}).click()
    await expect(page.getByLabel('Room attendance')).toHaveValue('40');await expect(page.getByLabel('Room layout')).toHaveValue('CLASSROOM')
    await page.getByLabel('Location',{exact:true}).fill(suffix)
    await page.getByRole('button',{name:'Search available venues',exact:true}).click()
    await expect(page.locator('.venue-search-result').filter({has:page.getByRole('heading',{name:venues[0].name,exact:true})})).toHaveCount(0)
    const candidate=page.locator('.venue-search-result').filter({has:page.getByRole('heading',{name:venues[2].name,exact:true})})
    await expect(candidate).toContainText('Full match');await page.getByLabel('Change reason',{exact:true}).fill('Move only the breakout room')
    await page.screenshot({path:testInfo.outputPath('CS-87-13-booking-specific-alternatives.png'),fullPage:true})
    await candidate.getByRole('button',{name:'Change this booking',exact:true}).click()
    await expect(page.locator(`[data-booking-id="${rooms[0].id}"]`)).toContainText(venues[2].name)
    const summary=await (await coordinator.get(`/api/bookings/events/${event.eventId}/summary`)).json(),moved=summary.items.find((room:any)=>room.id===rooms[0].id),sibling=await (await coordinator.get(`/api/bookings/${rooms[1].id}`)).json()
    expect(summary.items).toHaveLength(2);expect(moved).toMatchObject({venueId:venues[2].id,version:2,expectedAttendance:40,layout:'CLASSROOM'});const {effectiveStatus,...storedSibling}=sibling;expect(storedSibling).toEqual(rooms[1]);expect(effectiveStatus).toBe('TENTATIVELY_HELD')
    const extensionRoom=page.locator(`[data-booking-id="${moved.id}"]`),requestedDeadline=new Date(Date.parse(moved.expiresAt)+3600000+8*3600000).toISOString().slice(0,16)
    await extensionRoom.getByLabel('Requested deadline (Asia/Singapore)',{exact:true}).fill(requestedDeadline)
    await extensionRoom.getByLabel('Extension request reason',{exact:true}).fill('Awaiting final venue review')
    await extensionRoom.getByRole('button',{name:'Request hold extension',exact:true}).click()
    await expect(extensionRoom).toContainText('Extension awaiting Staff approval')
    await signIn(staffPage,emails.staff);await staffPage.getByRole('button',{name:'Booking requests',exact:true}).click()
    const card=staffPage.locator(`[data-booking-id="${moved.id}"]`)
    await card.getByLabel('Decision or extension reason').fill('Allow one additional hour for venue review')
    await card.getByRole('button',{name:'Approve extension',exact:true}).click()
    await expect.poll(async()=>{const value=await (await staff.get(`/api/bookings/${moved.id}`)).json();return value.version}).toBe(4)
    const extended=await (await staff.get(`/api/bookings/${moved.id}`)).json();expect(Date.parse(extended.expiresAt)).toBeGreaterThan(Date.parse(moved.expiresAt));expect(extended.status).toBe('TENTATIVELY_HELD')
    await staffPage.screenshot({path:testInfo.outputPath('CS-37-11-live-staff-extension.png'),fullPage:true})
    await page.screenshot({path:testInfo.outputPath('CS-87-13-only-breakout-moved.png'),fullPage:true})
  }finally{await coordinator.dispose();await staff.dispose();await staffPage.close()}
})

test('TC-CS87-25 TC-CS87-03 TC-CS84-31 LIVE Coordinator requests independent rooms and Staff decisions update the real Event page',async({page,browser,playwright,owner},testInfo)=>{
  const submitted=await created(owner,'submit',validRequest({expectedAttendance:80,minimumCapacity:80,accessibilityNeeds:['Wheelchair accessible entrance & seating']}))
  const coordinator=await assignedSession(playwright.request,owner,submitted.id)
  const contact=await (await owner.get(`/api/events/${submitted.id}/coordinator`)).json()
  const staff=await session(playwright.request,emails.staff)
  const staffPage=await browser.newPage()
  try {
    const approval=await mutation(coordinator,'POST',`/api/events/${submitted.id}/decision`,{decision:'approve',version:submitted.version})
    expect(approval.status()).toBe(200);const event=await approval.json()
    const suffix=randomUUID(),venues=[]
    for(let i=0;i<2;i++){
      const response=await mutation(staff,'POST','/api/venues',{name:`Workflow room ${i} ${suffix}`,address:'Synthetic review venue',capacity:120,venueType:'PHYSICAL',supportedLayouts:['THEATRE'],facilities:['PROJECTOR'],accessibilityTags:['WHEELCHAIR_ACCESS'],timeZone:'Asia/Singapore',managedById:'a1000000-0000-4000-8000-000000000008',reason:'Isolated Sprint 3 browser fixture',setupMinutes:30,turnaroundMinutes:30,operatingHours:['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].map(weekday=>({weekday,isClosed:false,opensAt:'08:00',closesAt:'20:00'}))})
      expect(response.status()).toBe(200);venues.push(await response.json())
    }
    await signIn(page,contact.email)
    await page.goto(`/events/${event.eventId}`)
    // Actual production HTML must be inert until hydration; accepted workflow
    // assertions below still use normal user clicks, without delays or retries.
    const beforeHydration=await browser.newContext({baseURL:new URL(page.url()).origin,storageState:await page.context().storageState(),viewport:page.viewportSize() ?? undefined,javaScriptEnabled:false})
    try {
      const ssr=await beforeHydration.newPage();await ssr.goto(`/events/${event.eventId}`)
      await expect(ssr.getByRole('button',{name:'Add another venue',exact:true})).toBeDisabled()
      await expect(ssr.getByRole('button',{name:'Refresh arrangements',exact:true})).toBeDisabled()
    }finally{await beforeHydration.close()}
    await page.getByRole('button',{name:'Add another venue',exact:true}).click()
    await expect(page.getByLabel('Room attendance')).toHaveValue('80')
    await page.getByLabel('Room start (Asia/Singapore)',{exact:true}).fill('2028-11-20T10:00')
    await page.getByLabel('Room end (Asia/Singapore)',{exact:true}).fill('2028-11-20T12:00')
    await page.getByRole('button',{name:'Search available venues',exact:true}).click()
    await page.getByLabel('Request reason',{exact:true}).fill('Conference main and breakout rooms')
    for(const venue of venues){
      const card=page.locator('.venue-search-result').filter({has:page.getByRole('heading',{name:venue.name,exact:true})})
      await expect(card).toContainText('Full match')
      await card.getByRole('button',{name:'Request this venue',exact:true}).click()
      await expect(page.locator('.existing-booking').filter({hasText:venue.name})).toContainText('Hold expires')
    }
    let summary=await (await coordinator.get(`/api/bookings/events/${event.eventId}/summary`)).json()
    expect(summary.items).toHaveLength(2);expect(summary.venueReady).toBe(false)
    expect(summary.items.every((room:any)=>room.expectedAttendance===80 && room.version===1 && room.expiresAt)).toBe(true)
    await page.screenshot({path:testInfo.outputPath('CS-87-03-independent-holds.png'),fullPage:true})
    await signIn(staffPage,emails.staff)
    await staffPage.getByRole('button',{name:'Booking requests',exact:true}).click()
    const [first,second]=summary.items
    const firstCard=staffPage.locator(`[data-booking-id="${first.id}"]`)
    await firstCard.getByLabel('Decision or extension reason').fill('Capacity, layout and access verified')
    await firstCard.getByRole('button',{name:'Approve',exact:true}).click()
    await expect(firstCard).toHaveCount(0)
    const secondCard=staffPage.locator(`[data-booking-id="${second.id}"]`)
    await expect(secondCard.getByRole('button',{name:'Reject',exact:true})).toBeDisabled()
    await secondCard.getByLabel('Decision or extension reason').fill('Breakout room no longer required for this plan')
    await secondCard.getByRole('button',{name:'Reject',exact:true}).click()
    await expect(secondCard).toHaveCount(0)
    await page.getByRole('button',{name:'Refresh arrangements',exact:true}).click()
    const rejected=page.locator(`[data-booking-id="${second.id}"]`)
    await expect(rejected).toContainText('rejected')
    await expect(page.locator(`#venue-outstanding`)).toContainText(second.venueName)
    await rejected.getByRole('button',{name:'Cancel this booking',exact:true}).click()
    const cancellation=page.getByRole('dialog',{name:'Confirm booking cancellation'});await cancellation.getByLabel('Cancellation reason').fill('Retire this request and retain the main room');await cancellation.getByRole('button',{name:'Confirm cancellation',exact:true}).click();await expect(cancellation).toHaveCount(0)
    await expect(page.getByText('All required venues are approved for the current requirements.',{exact:true})).toBeVisible()
    summary=await (await coordinator.get(`/api/bookings/events/${event.eventId}/summary`)).json()
    expect(summary.venueReady).toBe(true);expect(summary.items.map((r:any)=>r.status).sort()).toEqual(['CANCELLED','CONFIRMED'])
    await page.screenshot({path:testInfo.outputPath('CS-87-07-required-room-ready.png'),fullPage:true})
    const primaryCard=page.locator(`[data-booking-id="${first.id}"]`)
    await primaryCard.getByRole('button',{name:'Make primary location',exact:true}).click()
    await expect(primaryCard).toContainText('Primary attendee location')
    await page.reload()
    await expect(page.locator(`[data-booking-id="${first.id}"]`)).toContainText('Primary attendee location')
    const selected=await (await coordinator.get(`/api/bookings/events/${event.eventId}/summary`)).json()
    expect(selected.primaryVenue).toMatchObject({bookingId:first.id,version:1,available:true})
    expect(selected.items.map((r:any)=>r.status).sort()).toEqual(['CANCELLED','CONFIRMED'])
    await page.screenshot({path:testInfo.outputPath('CS-87-primary-location.png'),fullPage:true})
    const selectionQuery='SELECT "eventId","bookingId",version,"actorId" FROM event_primary_venues WHERE "eventId"=$1'
    const roomsQuery='SELECT id,status,version FROM venue_booking_requests WHERE "eventId"=$1 ORDER BY id'
    const proof=await reviewDatabase('booking',async db=>({selection:(await db.query(selectionQuery,[event.eventId])).rows,rooms:(await db.query(roomsQuery,[event.eventId])).rows}))
    expect(proof.selection).toHaveLength(1);expect(proof.selection[0]).toMatchObject({eventId:event.eventId,bookingId:first.id,version:1,actorId:selected.event.currentCoordinatorId})
    expect(proof.rooms.map((r:any)=>r.status).sort()).toEqual(['CANCELLED','CONFIRMED'])
    await databaseEvidence(page,testInfo,'TC-CS87-25-primary',[{database:'booking_db',query:selectionQuery,rows:proof.selection},{database:'booking_db',query:roomsQuery,rows:proof.rooms}])
    const frozen=await (await staff.get(`/api/venues/${first.venueId}`)).json()
    expect(frozen.buffersLockedAt).toBeTruthy()
    const forbiddenBuffer=await mutation(staff,'PUT',`/api/venues/${first.venueId}`,{...frozen,setupMinutes:60,reason:'Must preserve confirmed buffers'})
    expect(forbiddenBuffer.status()).toBe(409)
    expect((await (await staff.get(`/api/venues/${first.venueId}`)).json()).setupMinutes).toBe(30)
    const replay=await mutation(staff,'PUT',`/api/bookings/${first.id}/decision`,{version:1,status:'CONFIRMED',reason:'Stale duplicate'})
    expect(replay.status()).toBe(409)
  }finally{await coordinator.dispose();await staff.dispose();await staffPage.close()}
})
