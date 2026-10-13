import {expect} from '@playwright/test'
import {test,session,emails,signIn,mutation} from './helpers'
import {createVenue,planningEvent,hold,roomInput,reviewDatabase,databaseEvidence} from './venue-fixtures'
test('TC-CS85-30 LIVE setup and turnaround preserve advertised time and protect the occupied window',async({page,playwright,owner},info)=>{
  const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
  try {
    const venue=await createVenue(staff),room=await hold(p.coordinator,p.event.eventId,venue.id)
    expect(room.startAt).toBe('2028-11-20T02:00:00.000Z');expect(room.occupiedStart).toBe('2028-11-20T01:30:00.000Z');expect(room.occupiedEnd).toBe('2028-11-20T04:45:00.000Z')
    const refused=await mutation(p.coordinator,'POST','/api/bookings',roomInput(p.event.eventId,venue.id,{title:'Competing room request',reason:'Must refuse turnaround overlap',startAt:'2028-11-20T04:30:00Z',endAt:'2028-11-20T05:00:00Z'}))
    expect(refused.status()).toBe(409)
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
  }finally{await staff.dispose();await p.coordinator.dispose()}
})
