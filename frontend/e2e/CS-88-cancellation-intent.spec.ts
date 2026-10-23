import {expect,type APIRequest} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {session,emails,signIn,eventService,waitForEventService,recreateBookingService} from './helpers'
import {createVenue,planningEvent,hold,roomInput} from './fixtures/venue-fixtures'
import {test,mutation,value,summary,current,approve,evidence,reviewDatabase,registrations,internalRequest} from './fixtures/sprint4-fixtures'

// The private orchestration command requires a real Coordinator session as well
// as its service key. Authentication is setup only; no credential enters proof.
async function coordinatorToken(request:APIRequest,email:string){
 const realm=JSON.parse(readFileSync(new URL('../../infra/keycloak/connectsphere-realm.json',import.meta.url),'utf8'))
 const user=realm.users.find((entry:any)=>entry.email===email)
 if(!user)throw Error('Missing synthetic Coordinator fixture')
 const client=await request.newContext({baseURL:process.env.KONG_BASE})
 try{
  for(let attempt=0;attempt<3;attempt++){
   const response=await client.post('/auth/login',{data:{email,password:user.credentials.find((entry:any)=>entry.type==='password').value}})
   if(response.status()===429){
    expect(attempt,'Gateway kept rate limiting the actual Coordinator session').toBeLessThan(2)
    const seconds=Math.min(60,Math.max(1,Number(response.headers()['retry-after'])||60))
    await response.dispose();await new Promise(resolve=>setTimeout(resolve,seconds*1000));continue
   }
   expect(response.status()).toBe(200)
   const body=await response.json();expect(typeof body.token).toBe('string');expect(body.token.length).toBeGreaterThan(0)
   return body.token as string
  }
  throw Error('Coordinator authentication did not complete')
 }finally{await client.dispose()}
}

test('TC-CS88-18 LIVE pre-final component: accepted Coordinator intent stays Cancelling while durable venue receipts survive retries and outages without final notices',async({page,playwright,owner},info)=>{
 const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner),other=await planningEvent(playwright.request,owner)
 let sourceStopped=false
 try{
  const rooms=[]
  for(let i=0;i<3;i++){const room=await hold(p.coordinator,p.event.eventId,(await createVenue(staff)).id);rooms.push(i<2?await approve(staff,room):room)}
  const unrelated=await approve(staff,await hold(other.coordinator,other.event.eventId,(await createVenue(staff)).id))
  await registrations(p.event.eventId,3,rooms[0])
  const reservationId='intent-preservation-'+p.event.eventId
  await reviewDatabase('equipment',async db=>db.query('INSERT INTO equipment_reservations(id,"eventRequestId","eventId","requestVersion","equipmentType",quantity,"startAt","endAt",active,"actorId","sourceVersions") VALUES($1,$2,$3,1,\'projector\',1,$4,$5,true,$6,\'{}\'::jsonb)',[reservationId,p.event.id,p.event.eventId,rooms[0].occupiedStart,rooms[0].occupiedEnd,p.contact.id]))
  const before=await summary(p.coordinator,p.event.eventId),request=await value(await owner.get(`/api/events/${p.event.id}`))
  const input={eventRequestId:p.event.id,eventVersion:before.event.version,requestVersion:request.version,cancellationActionId:randomUUID(),reason:'Accepted cancellation; other resource releases are still pending'}
  const intentPath=`/internal/events/${p.event.eventId}/cancellation-intents`,releasePath=`/internal/events/${p.event.eventId}/cancellation-release`
  expect(internalRequest('event',intentPath,input).status).toBe(401)
  expect(internalRequest('booking',releasePath,{eventVersion:input.eventVersion,cancellationActionId:input.cancellationActionId}).status).toBe(409)
  const bearer=await coordinatorToken(playwright.request,p.contact.email)
  const accepted=internalRequest('event',intentPath,input,bearer)
  expect(accepted.status).toBe(200);expect(accepted.body).toMatchObject({eventId:p.event.eventId,eventRequestId:p.event.id,status:'CANCELLING',phase:'CANCELLING',cancellationActionId:input.cancellationActionId,actorId:p.contact.id})
  expect(internalRequest('event',intentPath,input,bearer)).toEqual(accepted)
  expect(internalRequest('event',intentPath,{...input,reason:'A different action cannot borrow this identity'},bearer).status).toBe(409)
  const releaseInput={eventVersion:accepted.body.eventVersion,cancellationActionId:input.cancellationActionId}
  expect(internalRequest('booking',releasePath,{...releaseInput,eventVersion:releaseInput.eventVersion-1}).status).toBe(409)
  // Existing Coordinator/Staff pages may be stale, but their writes must fail.
  const staleApproval=await mutation(staff,'PUT',`/api/bookings/${rooms[2].id}/decision`,{version:rooms[2].version,status:'CONFIRMED',reason:'Stale Staff tab'})
  expect(staleApproval.status()).toBe(409)
  const staleCreate=await mutation(p.coordinator,'POST','/api/bookings',roomInput(p.event.eventId,rooms[0].venueId))
  expect(staleCreate.status()).toBe(409)
  const result=internalRequest('booking',releasePath,releaseInput)
  expect(result.status).toBe(200);expect(result.body).toMatchObject({eventId:p.event.eventId,eventVersion:accepted.body.eventVersion,cancellationActionId:input.cancellationActionId,resource:'VENUE',phase:'CANCELLING'})
  expect([...result.body.releasedBookingIds].sort()).toEqual(rooms.map(room=>room.id).sort())
  expect(result.body.releasedIntervals).toHaveLength(3)
  for(const room of rooms){
   expect(result.body.releasedIntervals.find((interval:any)=>interval.bookingId===room.id)).toMatchObject({bookingId:room.id,venueId:room.venueId,startAt:room.startAt,endAt:room.endAt,occupiedStart:room.occupiedStart,occupiedEnd:room.occupiedEnd})
   expect((await current(staff,room.id)).status).toBe('CANCELLED')
   const availability=await value(await staff.get(`/api/bookings/availability?venueId=${room.venueId}&startAt=${room.occupiedStart}&endAt=${room.occupiedEnd}`))
   expect(availability.items.some((row:any)=>row.id===room.id)).toBe(false)
  }
  expect(internalRequest('booking',releasePath,{...releaseInput,eventVersion:releaseInput.eventVersion+1}).status).toBe(409)
  expect(await current(staff,unrelated.id)).toMatchObject(unrelated)
  await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`)
  await expect(page.getByRole('status').filter({hasText:'Cancelling — resource releases are in progress'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Add another venue',exact:true})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Send for Safety Check',exact:true})).toHaveCount(0)
  await expect(page.locator('[data-booking-id]')).toHaveCount(3)
  await page.screenshot({path:info.outputPath('TC-CS88-18-cancelling-retains-booking-history.png'),fullPage:true})

  // Recreate the Booking process and take Event offline: an exact persisted
  // receipt must replay without a live proof call or a second business effect.
  recreateBookingService()
  await expect.poll(()=>{try{return internalRequest('booking',releasePath,releaseInput)}catch{return {status:0}}},{timeout:45_000}).toEqual(result)
  eventService('stop');sourceStopped=true
  expect(internalRequest('booking',releasePath,releaseInput)).toEqual(result)
  eventService('start');sourceStopped=false
  await waitForEventService(p.coordinator,p.event.id)
  const eventQuery='SELECT id,status,version,"cancelledAt" FROM events WHERE id=$1',eventRows=(await reviewDatabase('event',async db=>db.query(eventQuery,[p.event.eventId]))).rows
  expect(eventRows).toEqual([{id:p.event.eventId,status:'CANCELLING',version:accepted.body.eventVersion,cancelledAt:null}])
  const finalQuery='SELECT count(*)::int AS count FROM outbox WHERE "aggregateId"=$1 AND "eventType"=\'EventCancelled\'',finalRows=(await reviewDatabase('event',async db=>db.query(finalQuery,[p.event.eventId]))).rows
  expect(finalRows).toEqual([{count:0}])
  const noticeQuery='SELECT count(*)::int AS count FROM notifications WHERE "eventId"=$1 AND type IN (\'BOOKING_CANCELLED\',\'EVENT_CANCELLED\')',noticeRows=(await reviewDatabase('notification',async db=>db.query(noticeQuery,[p.event.eventId]))).rows
  expect(noticeRows).toEqual([{count:0}])
  const registrationQuery='SELECT status,count(*)::int AS count FROM registrations WHERE "eventId"=$1 GROUP BY status',registered=(await reviewDatabase('attendance',async db=>db.query(registrationQuery,[p.event.eventId]))).rows
  expect(registered).toEqual([{status:'CONFIRMED',count:3}])
  const equipmentQuery='SELECT id,active FROM equipment_reservations WHERE id=$1',equipment=(await reviewDatabase('equipment',async db=>db.query(equipmentQuery,[reservationId]))).rows
  expect(equipment).toEqual([{id:reservationId,active:true}])
  const releaseQuery='SELECT kind,count(*)::int AS count FROM booking_outbox WHERE payload->>\'cancellationActionId\'=$1 GROUP BY kind',releaseRows=(await reviewDatabase('booking',async db=>db.query(releaseQuery,[input.cancellationActionId]))).rows
  expect(releaseRows).toEqual([{kind:'VenueCancellationReleased',count:3}])
  await info.attach('TC-CS88-18-accepted-intent-and-durable-receipt',{body:Buffer.from(JSON.stringify({scope:'Pre-final venue component, not the complete public CS-54 saga; equipment and registration release remain pending.',accepted,result,staleApproval:staleApproval.status(),staleCreate:staleCreate.status(),restartAndSourceOutageReplayMatched:true},null,2)),contentType:'application/json'})
  await evidence(page,info,'TC-CS88-18',p.event.eventId,[{database:'event_db',query:eventQuery,rows:eventRows},{database:'event_db',query:finalQuery,rows:finalRows},{database:'notification_db',query:noticeQuery,rows:noticeRows},{database:'booking_db',query:releaseQuery,rows:releaseRows},{database:'attendance_db',query:registrationQuery,rows:registered},{database:'equipment_db',query:equipmentQuery,rows:equipment}])
 }finally{
  if(sourceStopped){eventService('start');await waitForEventService(p.coordinator,p.event.id)}
  await staff.dispose();await p.coordinator.dispose();await other.coordinator.dispose()
 }
})
