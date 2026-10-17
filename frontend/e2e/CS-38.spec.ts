import {expect} from '@playwright/test'
import {test,session,emails,signIn,mutation} from './helpers'
import {createVenue,planningEvent,hold,roomInput,reviewDatabase,databaseEvidence} from './venue-fixtures'
test('TC-CS38-30 LIVE Coordinator hold becomes confirmed on Staff approval without an extra Coordinator action',async({page,playwright,owner},info)=>{
  const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
  try {
    const venue=await createVenue(staff),room=await hold(p.coordinator,p.event.eventId,venue.id)
    expect(room).toMatchObject({status:'TENTATIVELY_HELD',version:1})
    await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`)
    const requested=page.locator(`[data-booking-id="${room.id}"]`)
    await expect(requested).toContainText('tentatively held')
    await expect(requested.getByRole('button',{name:/confirm/i})).toHaveCount(0)
    await page.screenshot({path:info.outputPath('TC-CS38-30-coordinator-tentative-hold.png'),fullPage:true})
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
    const outboxQuery='SELECT id,kind,payload FROM booking_outbox WHERE "aggregateId"=$1 AND kind=$2'
    const intents=(await reviewDatabase('booking',async db=>db.query(outboxQuery,[room.id,'VenueBookingApproved']))).rows
    expect(intents).toHaveLength(1);expect(intents[0].payload.coordinatorId).toBe(p.contact.id)
    expect(history.rows.map((row:any)=>row.action)).toEqual(['BOOKING_CREATED','STATUS_CHANGED'])
    const effectsQuery='SELECT (SELECT count(*) FROM venue_booking_requests WHERE "eventId"=$1) AS bookings,(SELECT count(*) FROM venue_booking_activity a JOIN venue_booking_requests b ON b.id=a."bookingId" WHERE b."eventId"=$1) AS activities,(SELECT count(*) FROM booking_outbox WHERE payload->>\'eventId\'=$1) AS intents'
    const effectsBefore=(await reviewDatabase('booking',async db=>db.query(effectsQuery,[p.event.eventId]))).rows
    const confirmedClash=await mutation(p.coordinator,'POST','/api/bookings',roomInput(p.event.eventId,venue.id))
    expect(confirmedClash.status()).toBe(409);expect(JSON.stringify(await confirmedClash.json())).toContain(room.id)
    expect((await reviewDatabase('booking',async db=>db.query(effectsQuery,[p.event.eventId]))).rows).toEqual(effectsBefore)
    expect((await reviewDatabase('booking',async db=>db.query(outboxQuery,[room.id,'VenueBookingApproved']))).rows).toEqual(intents)
    expect((await reviewDatabase('booking',async db=>db.query(historyQuery,[room.id]))).rows).toEqual(history.rows)
    const inboxQuery='SELECT id,type,"recipientId","sourceMessageId" FROM notifications WHERE "sourceMessageId"=$1'
    let delivered:any[]=[]
    await expect.poll(async()=>{delivered=(await reviewDatabase('notification',async db=>db.query(inboxQuery,[intents[0].id]))).rows;return delivered.filter(x=>x.recipientId===p.contact.id&&x.type==='VENUE_APPROVED').length},{timeout:20000}).toBe(1)
    await signIn(page,p.contact.email);await page.getByTestId('bell').click()
    const notices=page.getByRole('dialog',{name:'Notifications'});await expect(notices).toContainText(venue.name);await expect(notices).toContainText('was approved')
    await page.screenshot({path:info.outputPath('TC-CS38-30-coordinator-decision-notice.png'),fullPage:true})
    await page.goto(`/events/${p.event.eventId}`)
    const confirmed=page.locator(`[data-booking-id="${room.id}"]`)
    await expect(confirmed).toContainText('Venue approved')
    await expect(confirmed.getByRole('button',{name:/confirm/i})).toHaveCount(0)
    const summary=await (await p.coordinator.get(`/api/bookings/events/${p.event.eventId}/summary`)).json()
    expect(summary.policy.pendingClarifications).toEqual([])
    expect(summary.event.status).toBe('ARRANGEMENT_PENDING');expect(summary.venueReady).toBe(true)
    await page.screenshot({path:info.outputPath('TC-CS38-30-coordinator-confirmed-venue.png'),fullPage:true})
    const eventQuery='SELECT id,status FROM events WHERE id=$1'
    const eventRows=(await reviewDatabase('event',async db=>db.query(eventQuery,[p.event.eventId]))).rows
    expect(eventRows).toEqual([{id:p.event.eventId,status:'ARRANGEMENT_PENDING'}])
    await databaseEvidence(page,info,'TC-CS38-30',[{database:'booking_db',query,rows:current.rows},{database:'booking_db',query:historyQuery,rows:history.rows},{database:'booking_db',query:outboxQuery,rows:intents},{database:'notification_db',query:inboxQuery,rows:delivered},{database:'event_db',query:eventQuery,rows:eventRows}])
    const rejectedVenue=await createVenue(staff),toReject=await hold(p.coordinator,p.event.eventId,rejectedVenue.id)
    expect((await mutation(staff,'PUT','/api/bookings/'+toReject.id+'/decision',{version:1,status:'REJECTED',reason:'Choose the available alternative room'})).status()).toBe(200)
    const afterRejection=await hold(p.coordinator,p.event.eventId,rejectedVenue.id)
    expect(afterRejection.id).not.toBe(toReject.id)
    expect((await (await staff.get('/api/bookings/'+room.id)).json()).status).toBe('CONFIRMED')
    const reclaimedQuery='SELECT id,status,version FROM venue_booking_requests WHERE "venueId"=$1 ORDER BY "createdAt",id'
    const reclaimedRows=(await reviewDatabase('booking',async db=>db.query(reclaimedQuery,[rejectedVenue.id]))).rows
    expect(reclaimedRows.map((x:any)=>x.status).sort()).toEqual(['REJECTED','TENTATIVELY_HELD'])
    await databaseEvidence(page,info,'TC-CS38-30-rejected-slot',[{database:'booking_db',query:reclaimedQuery,rows:reclaimedRows}])
  }finally{await staff.dispose();await p.coordinator.dispose()}
})
