import {expect} from '@playwright/test'
import {test,session,emails,signIn,mutation} from './helpers'
import {createVenue,planningEvent,hold,reviewDatabase,databaseEvidence} from './fixtures/venue-fixtures'
test('TC-CS37-30 LIVE persisted deadline immediately blocks approval while the hold row remains',async({page,playwright,owner},info)=>{
  const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
  try {
    const venue=await createVenue(staff),room=await hold(p.coordinator,p.event.eventId,venue.id)
    await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`)
    await expect(page.locator(`[data-booking-id="${room.id}"]`)).toContainText('Hold expires')
    await expect(page.locator(`[data-booking-id="${room.id}"]`)).toContainText(/\d+h \d+m remaining/)
    await page.screenshot({path:info.outputPath('TC-CS37-30-persisted-deadline.png'),fullPage:true})
    await reviewDatabase('booking',async db=>db.query('UPDATE venue_booking_requests SET "expiresAt"=clock_timestamp()+interval \'70 seconds\' WHERE id=$1',[room.id]))
    await page.getByRole('button',{name:'Refresh arrangements',exact:true}).click()
    const countdown=page.locator(`[data-booking-id="${room.id}"]`)
    await expect(countdown).toContainText('0h 2m remaining')
    await expect.poll(()=>countdown.textContent(),{timeout:25000}).toContain('0h 1m remaining')
    await page.screenshot({path:info.outputPath('TC-CS37-30-live-countdown.png'),fullPage:true})
    // Fixture only: advance this one saved deadline instead of waiting72h.
    await reviewDatabase('booking',async db=>db.query('UPDATE venue_booking_requests SET "expiresAt"=clock_timestamp() WHERE id=$1',[room.id]))
    const denied=await mutation(staff,'PUT',`/api/bookings/${room.id}/decision`,{version:room.version,status:'CONFIRMED',reason:'Expired hold must refuse approval'})
    expect(denied.status()).toBe(409);expect((await denied.json()).data.error.code).toBe('HOLD_EXPIRED')
    await page.getByRole('button',{name:'Refresh arrangements',exact:true}).click()
    await expect(page.locator(`[data-booking-id="${room.id}"]`)).toContainText('expired')
    const query='SELECT id,status,"expiresAt",flags FROM venue_booking_requests WHERE id=$1'
    const result=await reviewDatabase('booking',async db=>db.query(query,[room.id]))
    expect(result.rows[0].status).toBe('TENTATIVELY_HELD')
    await page.screenshot({path:info.outputPath('TC-CS37-30-immediate-expiry.png'),fullPage:true})
    await databaseEvidence(page,info,'TC-CS37-30',[{database:'booking_db',query,rows:result.rows}])
  }finally{await staff.dispose();await p.coordinator.dispose()}
})
