import {expect} from '@playwright/test'
import {session,emails,signIn} from './helpers'
import {createVenue,planningEvent,hold} from './fixtures/venue-fixtures'
import {test,mutation,value,summary,current,approve,reviewedBody,cancel,evidence,reviewDatabase,safeConfirm,registrations,internalRequest} from './fixtures/sprint4-fixtures'
import {randomUUID} from 'node:crypto'

test('TC-CS88-16 LIVE component source-precondition: committed cancellation proof releases only its Event venues once and delivers exact Staff release notices',async({page,playwright,owner},info)=>{
 const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner),other=await planningEvent(playwright.request,owner)
 try{
  const rooms=[]
  for(let i=0;i<4;i++){const room=await hold(p.coordinator,p.event.eventId,(await createVenue(staff)).id);rooms.push(i<2?await approve(staff,room):room)}
  const unrelated=await approve(staff,await hold(other.coordinator,other.event.eventId,(await createVenue(staff)).id))
  // Source data preconditions isolate the release consumer; no CS-54 public cancellation is claimed.
  await reviewDatabase('booking',async db=>db.query('UPDATE venue_booking_requests SET "expiresAt"=clock_timestamp()-interval \'1 minute\' WHERE id=$1',[rooms[3].id]))
  await registrations(p.event.eventId,30,rooms[0])
  const reservationId='cancel-preservation-'+p.event.eventId
  await reviewDatabase('equipment',async db=>db.query('INSERT INTO equipment_reservations(id,"eventRequestId","eventId","requestVersion","equipmentType",quantity,"startAt","endAt",active,"actorId","sourceVersions") VALUES($1,$2,$3,1,\'projector\',1,$4,$5,true,$6,\'{}\'::jsonb)',[reservationId,p.event.id,p.event.eventId,rooms[0].occupiedStart,rooms[0].occupiedEnd,p.contact.id]))
  const actionId=randomUUID(),releasePath=`/internal/events/${p.event.eventId}/cancellation-release`,unproven=internalRequest('booking',releasePath,{eventVersion:2,cancellationActionId:actionId});expect(unproven.status).toBe(409)
  const before=await page.context().newPage();await evidence(before,info,'TC-CS88-16-unproven-refused',p.event.eventId);await before.close()
  const cancellation=await reviewDatabase('event',async db=>{
   const client=await db.connect();await client.query('BEGIN')
   try{
    const event=(await client.query('UPDATE events SET status=\'CANCELLED\',version=version+1,"cancelledById"=$2,"cancelledAt"=clock_timestamp(),"cancelReason"=$3,"safetyToken"=NULL WHERE id=$1 RETURNING id,version,"cancelledAt"',[p.event.eventId,p.contact.id,'Accepted cancellation source precondition'])).rows[0]
    const payload={eventId:event.id,eventVersion:event.version,cancellationActionId:actionId,actorId:p.contact.id,coordinatorId:p.contact.id,cancelledAt:event.cancelledAt.toISOString(),reason:'Accepted cancellation source precondition'}
    await client.query('INSERT INTO outbox(id,"aggregateType","aggregateId","eventType",payload) VALUES($1,\'Event\',$2,\'EventCancelled\',$3::jsonb)',[actionId,event.id,JSON.stringify(payload)])
    await client.query('INSERT INTO activity_log(id,"eventRequestId",action,"fromStatus","toStatus","actorType","actorId",details) VALUES($1,$2,\'CANCELLED\',\'ARRANGEMENT_PENDING\',\'CANCELLED\',\'USER\',$3,$4::jsonb)',[randomUUID(),p.event.id,p.contact.id,JSON.stringify({...payload,actorName:p.contact.name||'Current Coordinator'})])
    await client.query('COMMIT');return payload
   }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  })
  const body={eventVersion:cancellation.eventVersion,cancellationActionId:actionId}
  expect(internalRequest('booking',releasePath,{...body,eventVersion:body.eventVersion-1}).status).toBe(409)
  expect(internalRequest('booking',releasePath,{...body,cancellationActionId:randomUUID()}).status).toBe(409)
  const result=internalRequest('booking',releasePath,body);expect(result.status).toBe(200);expect([...result.body.releasedBookingIds].sort()).toEqual(rooms.slice(0,3).map(room=>room.id).sort());expect(internalRequest('booking',releasePath,body)).toEqual(result)
  for(const room of rooms.slice(0,3)){expect((await current(staff,room.id)).status).toBe('CANCELLED');const available=await value(await staff.get(`/api/bookings/availability?venueId=${room.venueId}&startAt=${room.occupiedStart}&endAt=${room.occupiedEnd}`));expect(available.items.some((row:any)=>row.id===room.id)).toBe(false)}
  expect((await current(staff,rooms[3].id)).status).toBe('TENTATIVELY_HELD');expect(await current(staff,unrelated.id)).toMatchObject(unrelated)
  const noticesQuery='SELECT id,type,"recipientId",text FROM notifications WHERE "eventId"=$1 AND type=\'BOOKING_CANCELLED\''
  await expect.poll(async()=> (await reviewDatabase('notification',async db=>db.query(noticesQuery,[p.event.eventId]))).rows.length).toBe(3)
  const notices=(await reviewDatabase('notification',async db=>db.query(noticesQuery,[p.event.eventId]))).rows;expect(notices.every((row:any)=>row.recipientId==='a1000000-0000-4000-8000-000000000008'&&row.text.includes('setup and turnaround'))).toBe(true)
  const registrationQuery='SELECT status,count(*)::int AS count FROM registrations WHERE "eventId"=$1 GROUP BY status',registered=(await reviewDatabase('attendance',async db=>db.query(registrationQuery,[p.event.eventId]))).rows;expect(registered).toEqual([{status:'CONFIRMED',count:30}])
  const equipmentQuery='SELECT id,active FROM equipment_reservations WHERE id=$1',equipment=(await reviewDatabase('equipment',async db=>db.query(equipmentQuery,[reservationId]))).rows;expect(equipment).toEqual([{id:reservationId,active:true}])
  const actionsQuery='SELECT action,count(*)::int AS count FROM venue_booking_activity WHERE changes->>\'cancellationActionId\'=$1 GROUP BY action',actions=(await reviewDatabase('booking',async db=>db.query(actionsQuery,[actionId]))).rows;expect(actions).toEqual([{action:'EVENT_CANCELLED_VENUE_RELEASED',count:3}])
  await signIn(page,emails.staff);await page.goto('/venue');await page.getByTestId('bell').click();const notice=page.locator(`[data-notice-id="${notices[0].id}"]`);await expect(notice).toContainText('setup and turnaround');await notice.screenshot({path:info.outputPath('TC-CS88-16-source-proven-staff-release.png')})
  await info.attach('TC-CS88-16-source-precondition-and-release-receipt',{body:Buffer.from(JSON.stringify({scope:'Component/source-precondition proof. Full CS-54 public cancellation remains absent.',unproven,cancellation,result,actions,notices},null,2)),contentType:'application/json'})
  await evidence(page,info,'TC-CS88-16',p.event.eventId,[{database:'booking_db',query:actionsQuery,rows:actions},{database:'attendance_db',query:registrationQuery,rows:registered},{database:'equipment_db',query:equipmentQuery,rows:equipment}])
 }finally{await staff.dispose();await p.coordinator.dispose();await other.coordinator.dispose()}
})

test('TC-CS88-01 TC-CS88-08 TC-CS88-10 LIVE scoped cancellation releases buffers, targets affected Staff, retains immutable history and replays once',async({page,playwright,owner},info)=>{
 const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
 try{
  const a=await createVenue(staff),b=await createVenue(staff,{managedById:'a1000000-0000-4000-8000-000000000009'}),rooms=[]
  for(const venue of [a,b,await createVenue(staff),await createVenue(staff)])rooms.push(await approve(staff,await hold(p.coordinator,p.event.eventId,venue.id,{expectedAttendance:20})))
  const before=await summary(p.coordinator,p.event.eventId),action=await cancel(p.coordinator,rooms[1]),saved=await value(action.response)
  expect(saved.status).toBe('CANCELLED');for(const other of [rooms[0],rooms[2],rooms[3]])expect(await current(p.coordinator,other.id)).toMatchObject(other)
  expect(await value(await mutation(p.coordinator,'PUT',`/api/bookings/${rooms[1].id}`,action.body,action.key))).toEqual(saved)
  const availability=await value(await staff.get(`/api/bookings/availability?venueId=${b.id}&startAt=${rooms[1].occupiedStart}&endAt=${rooms[1].occupiedEnd}`));expect(availability.items).toEqual([])
  const after=await summary(p.coordinator,p.event.eventId);expect(after.event.title).toBe(before.event.title);expect(after.event.status).toBe('ARRANGEMENT_PENDING')
  const query='SELECT type,"recipientId" FROM notifications WHERE "eventId"=$1 AND type=\'BOOKING_CANCELLED\''
  await expect.poll(async()=> (await reviewDatabase('notification',async db=>db.query(query,[p.event.eventId]))).rows).toEqual([{type:'BOOKING_CANCELLED',recipientId:'a1000000-0000-4000-8000-000000000009'}])
  const history=(await reviewDatabase('booking',async db=>db.query('SELECT "actorId",action,reason FROM venue_booking_activity WHERE "bookingId"=$1 AND "toStatus"=\'CANCELLED\'',[rooms[1].id]))).rows
  expect(history).toHaveLength(1);expect(history[0].actorId).toBe(p.contact.id)
  await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`);await expect(page.locator(`[data-booking-id="${saved.id}"]`)).toContainText('cancelled');await expect(page.getByRole('tabpanel',{name:'Activity history'})).toContainText('Venue booking cancelled')
  await page.locator(`[data-booking-id="${saved.id}"]`).screenshot({path:info.outputPath('TC-CS88-01-08-10-cancelled-only-selected-room.png')});await page.getByRole('tabpanel',{name:'Activity history'}).getByTestId('history-entry').filter({hasText:'Venue booking cancelled'}).locator('summary').click();await page.getByRole('tabpanel',{name:'Activity history'}).getByTestId('history-entry').filter({hasText:'Venue booking cancelled'}).screenshot({path:info.outputPath('TC-CS88-08-event-history.png')})
  await evidence(page,info,'TC-CS88-01-08-10',p.event.eventId)
 }finally{await staff.dispose();await p.coordinator.dispose()}
})

test('TC-CS88-03 TC-CS88-07 TC-CS88-12 LIVE last-venue dialog backs out, requires explicit confirmation and retains the Event',async({page,playwright,owner},info)=>{
 const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
 try{
  const v=await createVenue(staff),room=await approve(staff,await hold(p.coordinator,p.event.eventId,v.id,{expectedAttendance:40})),first=await approve(staff,await hold(p.coordinator,p.event.eventId,(await createVenue(staff)).id,{expectedAttendance:40}))
  await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`)
  await page.locator(`[data-booking-id="${first.id}"]`).getByRole('button',{name:'Cancel this booking',exact:true}).click()
  const firstDialog=page.getByRole('dialog',{name:'Confirm booking cancellation'});await expect(firstDialog).not.toContainText('no venue');await firstDialog.getByLabel('Cancellation reason').fill('Release one of two bookings');await firstDialog.screenshot({path:info.outputPath('TC-CS88-07-two-to-one-without-last-venue-warning.png')});await firstDialog.getByRole('button',{name:'Confirm cancellation',exact:true}).click();await expect(firstDialog).toHaveCount(0)
  await page.locator(`[data-booking-id="${room.id}"]`).getByRole('button',{name:'Cancel this booking',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Confirm booking cancellation'});await expect(dialog).toContainText('no venue')
  const reasonInput=dialog.getByLabel('Cancellation reason');await expect(reasonInput).toBeFocused();await reasonInput.fill('Review the last venue before deciding')
  await expect(dialog.getByRole('button',{name:'Confirm cancellation',exact:true})).toBeEnabled()
  await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'Confirm cancellation',exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(reasonInput).toBeFocused()
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);const cancelButton=page.locator(`[data-booking-id="${room.id}"]`).getByRole('button',{name:'Cancel this booking',exact:true});await expect(cancelButton).toBeFocused();expect((await current(p.coordinator,room.id)).status).toBe('CONFIRMED');await cancelButton.press('Enter');await expect(dialog).toBeVisible()
  await dialog.screenshot({path:info.outputPath('TC-CS88-03-07-12-last-venue-warning-before.png')})
  await dialog.getByRole('button',{name:'Keep booking',exact:true}).click();await page.locator(`[data-booking-id="${room.id}"]`).screenshot({path:info.outputPath('TC-CS88-03-12-kept-booking.png')});expect((await current(p.coordinator,room.id)).status).toBe('CONFIRMED');const backProof=await page.context().newPage();await evidence(backProof,info,'TC-CS88-03',p.event.eventId);await backProof.close()
  await page.locator(`[data-booking-id="${room.id}"]`).getByRole('button',{name:'Cancel this booking',exact:true}).click()
  await dialog.getByLabel('Cancellation reason').fill('Organiser agreed to revise the room plan')
  await dialog.getByRole('button',{name:'Confirm cancellation',exact:true}).click()
  await expect(dialog).toHaveCount(0);await expect(page.locator(`[data-booking-id="${room.id}"]`)).toContainText('cancelled')
  expect((await summary(p.coordinator,p.event.eventId)).event.status).toBe('ARRANGEMENT_PENDING')
  await page.screenshot({path:info.outputPath('TC-CS88-03-07-12-last-venue-after.png'),fullPage:true});await evidence(page,info,'TC-CS88-07-12',p.event.eventId)
 }finally{await staff.dispose();await p.coordinator.dispose()}
})

test('TC-CS88-02 TC-CS88-09 LIVE reviewed time change rechecks only one room and preserves registrations without attendee notices',async({page,playwright,owner},info)=>{
 const staff=await session(playwright.request,emails.staff),officer=await session(playwright.request,emails.officer),p=await planningEvent(playwright.request,owner,{equipmentNeeds:['No equipment required']})
 try{
  const rooms=[];for(let i=0;i<2;i++)rooms.push(await approve(staff,await hold(p.coordinator,p.event.eventId,(await createVenue(staff)).id,{expectedAttendance:40})))
  await safeConfirm(p.coordinator,officer,p.event.eventId,p.event.id);await registrations(p.event.eventId,30,rooms[0])
  const body=await reviewedBody(p.coordinator,rooms[1],'CHANGE',{...rooms[1],status:'TENTATIVELY_HELD',startAt:'2028-11-20T05:00:00.000Z',endAt:'2028-11-20T06:00:00.000Z',reason:'Move only this session'})
  const moved=await value(await mutation(p.coordinator,'PUT',`/api/bookings/${rooms[1].id}`,body));expect(moved.status).toBe('TENTATIVELY_HELD');expect(await current(p.coordinator,rooms[0].id)).toMatchObject(rooms[0])
  expect((await reviewDatabase('attendance',async db=>db.query('SELECT count(*)::int AS count FROM registrations WHERE "eventId"=$1 AND status=\'CONFIRMED\'',[p.event.eventId]))).rows[0].count).toBe(30)
  expect((await reviewDatabase('notification',async db=>db.query('SELECT id FROM notifications WHERE "eventId"=$1 AND type=\'VENUE_CHANGED\'',[p.event.eventId]))).rows).toEqual([])
  await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`);await expect(page.locator(`[data-booking-id="${moved.id}"]`)).toContainText('tentatively held')
  await page.screenshot({path:info.outputPath('TC-CS88-02-09-one-session-pending.png'),fullPage:true});await evidence(page,info,'TC-CS88-02-09',p.event.eventId,[{database:'attendance_db',query:'SELECT status,count(*)::int AS count FROM registrations WHERE \"eventId\"=$1 GROUP BY status',rows:(await reviewDatabase('attendance',async db=>db.query('SELECT status,count(*)::int AS count FROM registrations WHERE \"eventId\"=$1 GROUP BY status',[p.event.eventId]))).rows}])
 }finally{await staff.dispose();await officer.dispose();await p.coordinator.dispose()}
})

test('TC-CS88-04 TC-CS88-11 LIVE owner and former Coordinator cannot change venue commitments after reassignment',async({page,playwright,owner},info)=>{
 const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
 try{
  const room=await approve(staff,await hold(p.coordinator,p.event.eventId,(await createVenue(staff)).id))
  expect((await mutation(owner,'PUT',`/api/bookings/${room.id}`,{...room,status:'CANCELLED'})).status()).toBe(403)
  const newId=p.contact.id==='a1000000-0000-4000-8000-000000000007'?'a1000000-0000-4000-8000-000000000005':'a1000000-0000-4000-8000-000000000007'
  await reviewDatabase('event',async db=>db.query('UPDATE event_requests SET "currentCoordinatorId"=$2,version=version+1 WHERE id=$1',[p.event.id,newId]))
  expect((await mutation(p.coordinator,'PUT',`/api/bookings/${room.id}`,{...room,status:'CANCELLED'})).status()).toBe(403)
  expect((await current(staff,room.id)).status).toBe('CONFIRMED')
  await evidence(page,info,'TC-CS88-04-11',p.event.eventId)
 }finally{await staff.dispose();await p.coordinator.dispose()}
})

test('TC-CS88-05 LIVE accepted change supersedes current Safety and blocks preparation while preserving review history',async({page,playwright,owner},info)=>{
 const staff=await session(playwright.request,emails.staff),officer=await session(playwright.request,emails.officer),p=await planningEvent(playwright.request,owner,{equipmentNeeds:['No equipment required']})
 try{
  const room=await approve(staff,await hold(p.coordinator,p.event.eventId,(await createVenue(staff)).id))
  await safeConfirm(p.coordinator,officer,p.event.eventId,p.event.id)
  const action=await cancel(p.coordinator,room,{confirmLastVenue:true});expect((await value(action.response)).status).toBe('CANCELLED')
  const s=await value(await p.coordinator.get(`/api/safety/events/${p.event.eventId}`));expect(s.state).toBe('STALE');expect(s.event.status).toBe('ARRANGEMENT_PENDING')
  expect((await mutation(p.coordinator,'POST',`/api/safety/events/${p.event.eventId}/preparation`,{version:s.event.version})).status()).toBe(409)
  const rounds=(await reviewDatabase('event',async db=>db.query('SELECT id,status FROM safety_rounds WHERE "eventId"=$1',[p.event.eventId]))).rows;expect(rounds).toHaveLength(1);expect(rounds[0].status).toBe('SUPERSEDED')
  await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`);await page.screenshot({path:info.outputPath('TC-CS88-05-current-safety-required.png'),fullPage:true});await evidence(page,info,'TC-CS88-05',p.event.eventId)
 }finally{await staff.dispose();await officer.dispose();await p.coordinator.dispose()}
})

test('TC-CS88-15 LIVE cancellation resumes after a lost review acknowledgement or transient Booking failure with one review and one committed action',async({page,playwright,owner},info)=>{
 test.setTimeout(360000)
 const staff=await session(playwright.request,emails.staff)
 try{
  for(const fault of ['review-ack','booking']){
   const p=await planningEvent(playwright.request,owner)
   try{
    const room=await approve(staff,await hold(p.coordinator,p.event.eventId,(await createVenue(staff)).id))
    const reviewUrl=`**/api/safety/events/${p.event.eventId}/venue-change-reviews`,bookingUrl=`**/api/bookings/${room.id}`,reviews:any[]=[],changes:any[]=[]
    let injected=false
    await page.route(reviewUrl,async route=>{
     reviews.push({key:route.request().headers()['idempotency-key'],body:route.request().postDataJSON()})
     const response=await route.fetch()
     if(fault==='review-ack'&&!injected){expect(response.status()).toBe(200);await info.attach('lost-review-acknowledgement-source-response',{body:await response.body(),contentType:'application/json'});injected=true;await route.fulfill({status:503,json:{statusCode:503,statusMessage:'Controlled lost review acknowledgement'}})}else await route.fulfill({response})
    })
    await page.route(bookingUrl,async route=>{
     if(route.request().method()!=='PUT')return route.continue()
     changes.push({key:route.request().headers()['idempotency-key'],body:route.request().postDataJSON()})
     if(fault==='booking'&&!injected){injected=true;await route.fulfill({status:503,json:{statusCode:503,statusMessage:'Controlled temporary Booking outage'}})}else await route.continue()
    })
    await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`);await page.locator(`[data-booking-id="${room.id}"]`).getByRole('button',{name:'Cancel this booking',exact:true}).click()
    const dialog=page.getByRole('dialog',{name:'Confirm booking cancellation'});await dialog.getByLabel('Cancellation reason').fill('Resume the same reviewed cancellation after a temporary failure');await dialog.getByRole('button',{name:'Confirm cancellation',exact:true}).click()
    await expect.poll(()=>injected).toBe(true);await expect(dialog.getByRole('button',{name:'Confirm cancellation',exact:true})).toBeEnabled();expect((await current(staff,room.id)).status).toBe('CONFIRMED')
    await expect(dialog.getByRole('alert')).toContainText('try again')
    const reviewQuery='SELECT "bookingId","bookingVersion",action,"reviewedById" FROM venue_change_reviews WHERE "eventId"=$1';const storedReviews=()=>reviewDatabase('event',async db=>db.query(reviewQuery,[p.event.eventId]))
    expect((await storedReviews()).rows).toHaveLength(1);await dialog.screenshot({path:info.outputPath(`TC-CS88-15-${fault}-retry-ready.png`)})
    const before=await page.context().newPage();await evidence(before,info,`TC-CS88-15-${fault}-before-retry`,p.event.eventId,[{database:'event_db',query:reviewQuery,rows:(await storedReviews()).rows}]);await before.close()
    await dialog.getByRole('button',{name:'Confirm cancellation',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.locator(`[data-booking-id="${room.id}"]`)).toContainText('cancelled')
    expect((await storedReviews()).rows).toHaveLength(1)
    if(fault==='review-ack'){expect(reviews).toHaveLength(2);expect(reviews[1]).toEqual(reviews[0])}else{expect(reviews).toHaveLength(1);expect(changes).toHaveLength(2);expect(changes[1]).toEqual(changes[0])}
    await expect.poll(async()=> (await reviewDatabase('notification',async db=>db.query('SELECT id FROM notifications WHERE "eventId"=$1 AND type=\'BOOKING_CANCELLED\'',[p.event.eventId]))).rows.length).toBe(1)
    const activity=(await reviewDatabase('booking',async db=>db.query('SELECT count(*)::int AS count FROM venue_booking_activity WHERE "bookingId"=$1 AND "toStatus"=\'CANCELLED\'',[room.id]))).rows;expect(activity).toEqual([{count:1}])
    await page.locator(`[data-booking-id="${room.id}"]`).screenshot({path:info.outputPath(`TC-CS88-15-${fault}-cancelled-once.png`)});await evidence(page,info,`TC-CS88-15-${fault}-after-retry`,p.event.eventId,[{database:'event_db',query:reviewQuery,rows:(await storedReviews()).rows}])
    await info.attach(`TC-CS88-15-${fault}-network-assertions`,{body:Buffer.from(JSON.stringify({fault,injected,reviews,changes,activity},null,2)),contentType:'application/json'})
    await page.unroute(reviewUrl);await page.unroute(bookingUrl)
   }finally{await p.coordinator.dispose()}
  }
 }finally{await staff.dispose()}
})
