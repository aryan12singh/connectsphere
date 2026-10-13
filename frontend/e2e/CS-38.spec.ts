import {expect} from '@playwright/test'
import {test,session,emails,signIn,mutation} from './helpers'
import {createVenue,planningEvent,hold,reviewDatabase,databaseEvidence} from './venue-fixtures'
test('TC-CS38-30 LIVE Staff decision requires a reason and refuses stale replay without changing approval',async({page,playwright,owner},info)=>{
  const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
  try {
    const venue=await createVenue(staff),room=await hold(p.coordinator,p.event.eventId,venue.id)
    const forbidden=await mutation(p.coordinator,'PUT',`/api/bookings/${room.id}/decision`,{version:1,status:'CONFIRMED',reason:'Coordinator cannot approve'})
    expect(forbidden.status()).toBe(403)
    await signIn(page,emails.staff);await page.getByRole('button',{name:'Booking requests',exact:true}).click()
    const card=page.locator(`[data-booking-id="${room.id}"]`)
    await expect(card.getByRole('button',{name:'Approve',exact:true})).toBeDisabled()
    await card.getByLabel('Decision or extension reason').fill('Room capacity and access checked')
    await card.getByRole('button',{name:'Approve',exact:true}).scrollIntoViewIfNeeded()
    await page.screenshot({path:info.outputPath('TC-CS38-30-staff-decision.png'),fullPage:true})
    await card.getByRole('button',{name:'Approve',exact:true}).click();await expect(card).toHaveCount(0)
    const stale=await mutation(staff,'PUT',`/api/bookings/${room.id}/decision`,{version:1,status:'REJECTED',reason:'Stale decision'})
    expect(stale.status()).toBe(409)
    const saved=await (await staff.get(`/api/bookings/${room.id}`)).json();expect(saved.status).toBe('CONFIRMED');expect(saved.version).toBe(2)
    const query='SELECT id,status,version FROM venue_booking_requests WHERE id=$1'
    const historyQuery='SELECT action,reason,"actorRole","occurredAt" FROM venue_booking_activity WHERE "bookingId"=$1 ORDER BY "occurredAt",id'
    const [current,history]=await reviewDatabase('booking',async db=>Promise.all([db.query(query,[room.id]),db.query(historyQuery,[room.id])]))
    expect(current.rows).toEqual([{id:room.id,status:'CONFIRMED',version:2}])
    expect(history.rows.filter((row:any)=>row.reason==='Room capacity and access checked')).toHaveLength(1)
    await databaseEvidence(page,info,'TC-CS38-30',[{database:'booking_db',query,rows:current.rows},{database:'booking_db',query:historyQuery,rows:history.rows}])
  }finally{await staff.dispose();await p.coordinator.dispose()}
})
