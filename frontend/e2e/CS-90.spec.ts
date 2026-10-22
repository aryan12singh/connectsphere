import {expect} from '@playwright/test'
import {session,emails,signIn} from './helpers'
import {createVenue,planningEvent,hold,roomInput} from './fixtures/venue-fixtures'
import {test,mutation,value,current,approve,evidence,reviewDatabase,cancel} from './fixtures/sprint4-fixtures'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'

function service(name:string,action:string){const file=process.env.CSE2E_COMPOSE_FILE!;if(!/^csreview-aryan-ci-/.test(JSON.parse(readFileSync(file,'utf8')).name))throw Error('Only the isolated stack is permitted');execFileSync('docker',['compose','-f',file,action,name],{stdio:'pipe'})}
const waitFor=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))

test('TC-CS90-01 TC-CS90-03 TC-CS90-04 TC-CS90-05 TC-CS90-09 TC-CS90-15 LIVE real deadline expiry frees only the held interval, preserves the Event and other resources, then resubmits through a fresh request',async({page,playwright,owner},info)=>{
 const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
 try{
  const venue=await createVenue(staff),other=await approve(staff,await hold(p.coordinator,p.event.eventId,(await createVenue(staff)).id,{expectedAttendance:40})),held=await hold(p.coordinator,p.event.eventId,venue.id,{expectedAttendance:40,expiresAt:new Date(Date.now()+3500).toISOString()})
  const reservationId='expiry-preservation-'+held.id
  await reviewDatabase('equipment',async db=>db.query('INSERT INTO equipment_reservations(id,"eventRequestId","eventId","requestVersion","equipmentType",quantity,"startAt","endAt",active,"actorId","sourceVersions") VALUES($1,$2,$3,1,\'projector\',1,$4,$5,true,$6,\'{}\'::jsonb)',[reservationId,p.event.id,p.event.eventId,other.occupiedStart,other.occupiedEnd,p.contact.id]))
  const eventBefore=(await value(await p.coordinator.get(`/api/bookings/events/${p.event.eventId}/summary`))).event
  const due='SELECT kind,count(*)::int AS count FROM booking_outbox WHERE "aggregateId"=$1 AND kind=\'VenueHoldExpired\' GROUP BY kind'
  await expect.poll(async()=> (await reviewDatabase('booking',async db=>db.query(due,[held.id]))).rows,{timeout:15000}).toEqual([{kind:'VenueHoldExpired',count:1}])
  expect((await current(p.coordinator,held.id)).effectiveStatus).toBe('EXPIRED');expect((await mutation(staff,'PUT',`/api/bookings/${held.id}/decision`,{version:held.version,status:'CONFIRMED',reason:'Expired request must fail'})).status()).toBe(409)
  const calendar=await value(await staff.get(`/api/bookings/availability?venueId=${venue.id}&startAt=${held.occupiedStart}&endAt=${held.occupiedEnd}`));expect(calendar.items).toEqual([])
  expect((await reviewDatabase('equipment',async db=>db.query('SELECT active FROM equipment_reservations WHERE id=$1',[reservationId]))).rows).toEqual([{active:true}]);expect(await current(staff,other.id)).toMatchObject(other);expect((await value(await p.coordinator.get(`/api/bookings/events/${p.event.eventId}/summary`))).event).toEqual(eventBefore)
  const second=await planningEvent(playwright.request,owner);try{const reclaimed=await hold(second.coordinator,second.event.eventId,venue.id,{expectedAttendance:40});expect(reclaimed.status).toBe('TENTATIVELY_HELD');await value((await cancel(second.coordinator,reclaimed,{confirmLastVenue:true})).response)}finally{await second.coordinator.dispose()}
  await expect.poll(async()=> (await reviewDatabase('notification',async db=>db.query('SELECT id FROM notifications WHERE "eventId"=$1 AND type=\'HOLD_EXPIRED\'',[p.event.eventId]))).rows.length).toBe(1)
  await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`);const oldCard=page.locator(`[data-booking-id="${held.id}"]`);await expect(oldCard).toContainText('expired');await oldCard.screenshot({path:info.outputPath('TC-CS90-01-03-expired-request.png')});await oldCard.getByRole('button',{name:'Resubmit expired hold',exact:true}).click()
  await page.getByLabel('Location',{exact:true}).fill(venue.name);await page.getByRole('button',{name:'Search available venues',exact:true}).click();await page.getByLabel('Change reason',{exact:true}).fill('Fresh availability check after expiry');await page.locator('.venue-search-result').filter({hasText:venue.name}).getByRole('button',{name:'Submit fresh hold',exact:true}).click()
  const newQuery='SELECT id,status,"expiresAt","resubmittedFromId" FROM venue_booking_requests WHERE "resubmittedFromId"=$1'
  await expect.poll(async()=> (await reviewDatabase('booking',async db=>db.query(newQuery,[held.id]))).rows.length).toBe(1)
  const fresh=(await reviewDatabase('booking',async db=>db.query(newQuery,[held.id]))).rows[0];expect(fresh.status).toBe('TENTATIVELY_HELD');expect(fresh.id).not.toBe(held.id);expect(Date.parse(fresh.expiresAt)>Date.now()).toBe(true)
  await page.locator(`[data-booking-id="${fresh.id}"]`).screenshot({path:info.outputPath('TC-CS90-03-fresh-request-after-availability.png')});await evidence(page,info,'TC-CS90-01-03-04-05-09-15',p.event.eventId,[{database:'equipment_db',query:'SELECT id,active FROM equipment_reservations WHERE id=$1',rows:(await reviewDatabase('equipment',async db=>db.query('SELECT id,active FROM equipment_reservations WHERE id=$1',[reservationId]))).rows}])
 }finally{await staff.dispose();await p.coordinator.dispose()}
})

test('TC-CS90-02 TC-CS90-07 TC-CS90-12 LIVE approval before the deadline wins; approval at or after expiry loses across twenty real worker races',async({page,playwright,owner},info)=>{
 const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
 try{
  const allowed=await hold(p.coordinator,p.event.eventId,(await createVenue(staff)).id,{expiresAt:new Date(Date.now()+6000).toISOString()});await approve(staff,allowed);await waitFor(Math.max(1,Date.parse(allowed.expiresAt)-Date.now()+1200));expect((await current(staff,allowed.id)).status).toBe('CONFIRMED')
  expect((await reviewDatabase('booking',async db=>db.query('SELECT id FROM booking_outbox WHERE "aggregateId"=$1 AND kind=\'VenueHoldExpired\'',[allowed.id]))).rows).toEqual([])
  const races=[]
  for(let i=0;i<20;i++){
   const room=await hold(p.coordinator,p.event.eventId,(await createVenue(staff)).id)
   await reviewDatabase('booking',async db=>db.query('UPDATE venue_booking_requests SET "expiresAt"=clock_timestamp()-($2::int*interval \'1 second\') WHERE id=$1',[room.id,i%2]))
   const response=await mutation(staff,'PUT',`/api/bookings/${room.id}/decision`,{version:room.version,status:'CONFIRMED',reason:'Concurrent real expiry scan'})
   expect(response.status()).toBe(409);const actual=await current(staff,room.id);expect(actual.effectiveStatus).toBe('EXPIRED');races.push({bookingId:room.id,approvalStatus:response.status(),effectiveStatus:actual.effectiveStatus})
  }
  await expect.poll(async()=> (await reviewDatabase('booking',async db=>db.query('SELECT count(*)::int AS count FROM booking_outbox WHERE payload->>\'eventId\'=$1 AND kind=\'VenueHoldExpired\'',[p.event.eventId]))).rows[0].count,{timeout:30000}).toBe(20)
  await info.attach('twenty-approval-expiry-race-results',{body:Buffer.from(JSON.stringify(races,null,2)),contentType:'application/json'});await evidence(page,info,'TC-CS90-02-07-12',p.event.eventId)
 }finally{await staff.dispose();await p.coordinator.dispose()}
})

test('TC-CS90-06 TC-CS90-08 LIVE a current Coordinator request and one reasoned Staff extension reschedule the persisted deadline, warnings and history',async({page,playwright,owner},info)=>{
 const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
 try{
  const room=await hold(p.coordinator,p.event.eventId,(await createVenue(staff)).id,{expiresAt:new Date(Date.now()+6000).toISOString()}),expiresAt=new Date(Date.parse(room.expiresAt)+24*3600000).toISOString()
  expect((await mutation(staff,'PUT',`/api/bookings/${room.id}/hold-extension`,{version:room.version,expiresAt,reason:'No current Coordinator request'})).status()).toBe(409)
  const requested=await value(await mutation(p.coordinator,'POST',`/api/bookings/${room.id}/hold-extension/request`,{version:room.version,expiresAt,reason:'Awaiting venue access confirmation'}))
  const extended=await value(await mutation(staff,'PUT',`/api/bookings/${room.id}/hold-extension`,{version:requested.version,expiresAt,reason:'One approved extension for access review'}));expect(extended.extensionCount).toBe(1)
  await waitFor(Math.max(1,Date.parse(room.expiresAt)-Date.now()+1100));expect((await current(staff,room.id)).effectiveStatus).toBe('TENTATIVELY_HELD')
  await expect.poll(async()=> (await reviewDatabase('booking',async db=>db.query('SELECT count(*)::int AS count FROM booking_outbox WHERE \"aggregateId\"=$1 AND kind=\'VenueHoldExpiring\' AND payload->>\'expiresAt\'=$2',[room.id,expiresAt]))).rows[0].count).toBe(1)
  expect((await mutation(p.coordinator,'POST',`/api/bookings/${room.id}/hold-extension/request`,{version:extended.version,expiresAt:new Date(Date.parse(expiresAt)+1000).toISOString(),reason:'No second extension'})).status()).toBe(409)
  expect((await reviewDatabase('booking',async db=>db.query('SELECT id FROM booking_outbox WHERE "aggregateId"=$1 AND kind=\'VenueHoldExpired\'',[room.id]))).rows).toEqual([])
  await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`);await expect(page.locator(`[data-booking-id="${room.id}"]`)).toContainText('tentatively held');await page.locator(`[data-booking-id="${room.id}"]`).screenshot({path:info.outputPath('TC-CS90-06-active-approved-extension-before-expiry.png')});const activeProof=await page.context().newPage();await evidence(activeProof,info,'TC-CS90-06-active-extension',p.event.eventId);await activeProof.close()
  // Controlled persisted-deadline fixture advances the same production worker.
  await reviewDatabase('booking',async db=>db.query('UPDATE venue_booking_requests SET "expiresAt"=clock_timestamp()-interval \'1 second\' WHERE id=$1',[room.id]))
  const query='SELECT action FROM venue_booking_activity WHERE "bookingId"=$1 ORDER BY "occurredAt",id'
  await expect.poll(async()=> (await reviewDatabase('booking',async db=>db.query(query,[room.id]))).rows.map((r:any)=>r.action)).toContain('HOLD_EXPIRED')
  const actions=(await reviewDatabase('booking',async db=>db.query(query,[room.id]))).rows.map((r:any)=>r.action);expect(actions).toContain('HOLD_EXTENDED');expect(actions).toContain('HOLD_WARNING')
  await evidence(page,info,'TC-CS90-06-08',p.event.eventId,[{database:'booking_db',query,rows:(await reviewDatabase('booking',async db=>db.query(query,[room.id]))).rows}])
 }finally{await staff.dispose();await p.coordinator.dispose()}
})

test('TC-CS90-10 TC-CS90-11 LIVE warning threshold is immediate below and at24h, deferred above24h, with one current-deadline warning and history',async({page,playwright,owner},info)=>{
 const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
 try{
  const rooms=[]
  for(const minutes of [1439,1440,1441])rooms.push(await hold(p.coordinator,p.event.eventId,(await createVenue(staff)).id,{expiresAt:new Date(Date.now()+minutes*60000).toISOString()}))
  await waitFor(2200)
  for(let i=0;i<rooms.length;i++){
   const room=rooms[i],query='SELECT kind,count(*)::int AS count FROM booking_outbox WHERE "aggregateId"=$1 AND kind=\'VenueHoldExpiring\' GROUP BY kind'
   const rows=(await reviewDatabase('booking',async db=>db.query(query,[room.id]))).rows;expect(rows).toEqual(i<2?[{kind:'VenueHoldExpiring',count:1}]:[])
   const history=(await reviewDatabase('booking',async db=>db.query('SELECT count(*)::int AS count FROM venue_booking_activity WHERE "bookingId"=$1 AND action=\'HOLD_WARNING\'',[room.id]))).rows[0].count;expect(history).toBe(i<2?1:0)
  }
  await expect.poll(async()=> (await reviewDatabase('notification',async db=>db.query('SELECT count(*)::int AS count FROM notifications WHERE "eventId"=$1 AND type=\'HOLD_EXPIRING\'',[p.event.eventId]))).rows[0].count).toBe(2)
  await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`);await page.getByTestId('bell').click();await expect(page.getByRole('dialog',{name:'Notifications'})).toContainText('expires at');await page.getByRole('dialog',{name:'Notifications'}).screenshot({path:info.outputPath('TC-CS90-10-11-current-hold-warnings.png')});await evidence(page,info,'TC-CS90-10-11',p.event.eventId)
 }finally{await staff.dispose();await p.coordinator.dispose()}
})

test('TC-CS90-13 LIVE Booking worker and broker restart after committed expiry intent do not duplicate expiry history or inbox delivery',async({page,playwright,owner},info)=>{
 test.setTimeout(360000)
 const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
 let brokerStopped=false,bookingStopped=false
 try{
  const room=await hold(p.coordinator,p.event.eventId,(await createVenue(staff)).id)
  service('rabbitmq','stop');brokerStopped=true
  await reviewDatabase('booking',async db=>db.query('UPDATE venue_booking_requests SET "expiresAt"=clock_timestamp()-interval \'1 second\' WHERE id=$1',[room.id]))
  await expect.poll(async()=> (await reviewDatabase('booking',async db=>db.query('SELECT count(*)::int AS count FROM venue_booking_activity WHERE "bookingId"=$1 AND action=\'HOLD_EXPIRED\'',[room.id]))).rows[0].count).toBe(1)
  const before=(await reviewDatabase('booking',async db=>db.query('SELECT id,"deliveredAt" FROM booking_outbox WHERE "aggregateId"=$1 AND kind=\'VenueHoldExpired\'',[room.id]))).rows;expect(before).toHaveLength(1);expect(before[0].deliveredAt).toBeNull()
  service('booking-service','stop');bookingStopped=true;service('booking-service','start');bookingStopped=false;service('rabbitmq','start');brokerStopped=false
  await expect.poll(async()=> (await reviewDatabase('notification',async db=>db.query('SELECT count(*)::int AS count FROM notifications WHERE "sourceMessageId"=$1 AND type=\'HOLD_EXPIRED\'',[before[0].id]))).rows[0].count,{timeout:60000}).toBe(1)
  service('booking-service','restart')
  await expect.poll(async()=> (await p.coordinator.get(`/api/bookings/${room.id}`)).status(),{timeout:45000}).toBe(200)
  expect((await current(p.coordinator,room.id)).effectiveStatus).toBe('EXPIRED')
  expect((await reviewDatabase('booking',async db=>db.query('SELECT count(*)::int AS count FROM venue_booking_activity WHERE "bookingId"=$1 AND action=\'HOLD_EXPIRED\'',[room.id]))).rows[0].count).toBe(1)
  await evidence(page,info,'TC-CS90-13',p.event.eventId)
 }finally{if(bookingStopped)service('booking-service','start');if(brokerStopped)service('rabbitmq','start');await staff.dispose();await p.coordinator.dispose()}
})

test('TC-CS90-14 LIVE warning delivery resolves the current Coordinator after reassignment and suppresses the former recipient',async({page,playwright,owner},info)=>{
 const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
 try{
  const room=await hold(p.coordinator,p.event.eventId,(await createVenue(staff)).id),newId=p.contact.id==='a1000000-0000-4000-8000-000000000007'?'a1000000-0000-4000-8000-000000000005':'a1000000-0000-4000-8000-000000000007'
  await reviewDatabase('event',async db=>db.query('UPDATE event_requests SET "currentCoordinatorId"=$2,version=version+1 WHERE id=$1',[p.event.id,newId]))
  await reviewDatabase('booking',async db=>db.query('UPDATE venue_booking_requests SET "expiresAt"=clock_timestamp()+interval \'23 hours\' WHERE id=$1',[room.id]))
  const query='SELECT type,"recipientId" FROM notifications WHERE "eventId"=$1 AND type=\'HOLD_EXPIRING\''
  await expect.poll(async()=> (await reviewDatabase('notification',async db=>db.query(query,[p.event.eventId]))).rows).toEqual([{type:'HOLD_EXPIRING',recipientId:newId}]);await evidence(page,info,'TC-CS90-14',p.event.eventId)
 }finally{await staff.dispose();await p.coordinator.dispose()}
})
