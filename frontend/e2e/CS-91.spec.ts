import {expect} from '@playwright/test'
import {session,emails,signIn} from './helpers'
import {createVenue,planningEvent,hold,roomInput} from './fixtures/venue-fixtures'
import {test,mutation,value,current,summary,approve,block,blockBody,releaseBlock,evidence,reviewDatabase,registrations,internalRequest} from './fixtures/sprint4-fixtures'
import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
function broker(action:'start'|'stop'){const file=process.env.CSE2E_COMPOSE_FILE!;if(!/^csreview-aryan-ci-/.test(JSON.parse(readFileSync(file,'utf8')).name))throw Error('Only the isolated broker is permitted');execFileSync('docker',['compose','-f',file,action,'rabbitmq'],{stdio:'pipe'})}

test('TC-CS91-01 TC-CS91-03 TC-CS91-06 TC-CS91-08 TC-CS91-10 TC-CS91-13 TC-CS91-16 TC-CS91-19 TC-CS91-23 LIVE Staff previews both confirmed booking and hold, confirms impact, preserves details and informs only current Coordinator and Organiser',async({page,playwright,owner},info)=>{
 const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner),second=await planningEvent(playwright.request,owner)
 try{
  const venue=await createVenue(staff),a=await approve(staff,await hold(p.coordinator,p.event.eventId,venue.id)),b=await approve(staff,await hold(second.coordinator,second.event.eventId,venue.id,{startAt:'2028-11-20T05:15:00.000Z',endAt:'2028-11-20T06:00:00.000Z'})),activeHold=await hold(second.coordinator,second.event.eventId,venue.id,{startAt:'2028-11-20T07:30:00.000Z',endAt:'2028-11-20T08:00:00.000Z'})
  await registrations(p.event.eventId,20,a)
  const before=(await summary(p.coordinator,p.event.eventId)).event,beforeSecond=(await summary(second.coordinator,second.event.eventId)).event
  await signIn(page,emails.staff);await page.goto('/venue');await page.getByPlaceholder('Search venues...').fill(venue.name);await page.getByRole('button',{name:new RegExp(venue.name)}).click()
  const slot=page.getByRole('button',{name:/^Select .* at 14:00$/}).first();await slot.focus();await slot.press('Space');await expect(page.getByLabel('Start date and time')).toBeFocused();await page.getByRole('button',{name:'Close booking form',exact:true}).click();await slot.focus();await slot.press('Enter')
  const form=page.locator('form').filter({has:page.getByLabel('Start date and time')})
  expect(await form.getByLabel('Start date and time').inputValue()).toMatch(/T14:00$/)
  await form.getByLabel('Start date and time').fill('2028-11-20T09:30');await form.getByLabel('End date and time').fill('2028-11-20T16:45')
  await form.getByLabel('Title',{exact:true}).fill('Equipment failure closure');await form.getByLabel('Reason category').selectOption('EQUIPMENT_FAILURE');await form.getByLabel('Internal operational note').fill('Private fault investigation');await form.getByLabel('Reason',{exact:true}).fill('Operational repair required')
  await form.getByRole('button',{name:'Save booking',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Confirm affected bookings'});for(const room of [a,b,activeHold])await expect(dialog).toContainText(room.id===activeHold.id?activeHold.title:room.title);await expect(dialog).toContainText(p.event.eventId);await expect(dialog).toContainText(second.event.eventId)
  await expect(dialog.getByRole('button',{name:'Back',exact:true})).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'Confirm unavailable window',exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'Back',exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);const save=form.getByRole('button',{name:'Save booking',exact:true});await expect(save).toBeFocused();expect((await current(staff,a.id)).flags).toEqual([]);await save.press('Enter');await expect(dialog).toBeVisible()
  await dialog.screenshot({path:info.outputPath('TC-CS91-03-10-13-23-impact-preview.png')})
  expect((await current(staff,a.id)).flags).toEqual([])
  await dialog.getByRole('button',{name:'Confirm unavailable window',exact:true}).click();await expect(dialog).toHaveCount(0)
  for(const room of [a,b,activeHold])expect((await current(staff,room.id)).flags).toContain('AFFECTED_UNAVAILABLE')
  expect((await summary(p.coordinator,p.event.eventId)).event).toEqual(before);expect((await summary(second.coordinator,second.event.eventId)).event).toEqual(beforeSecond)
  const eventIds=[p.event.eventId,second.event.eventId],query='SELECT type,text,link,data,"recipientId","createdAt" FROM notifications WHERE "eventId"=ANY($1::text[]) AND type IN (\'VENUE_UNAVAILABLE\',\'VENUE_CHANGE_NEEDED\')'
  await expect.poll(async()=> (await reviewDatabase('notification',async db=>db.query(query,[eventIds]))).rows.length).toBe(6)
  const notices=(await reviewDatabase('notification',async db=>db.query(query,[eventIds]))).rows
  const closureSavedAt=(await reviewDatabase('booking',async db=>db.query('SELECT "createdAt" FROM venue_booking_requests WHERE "venueId"=$1 AND status IN (\'BLOCKED\',\'UNAVAILABLE\')',[venue.id]))).rows[0].createdAt
  const deliveryTiming=notices.map((notice:any)=>({recipientId:notice.recipientId,type:notice.type,closureSavedAt,deliveredAt:notice.createdAt,elapsedMs:new Date(notice.createdAt).getTime()-new Date(closureSavedAt).getTime()}));for(const delivery of deliveryTiming){expect(delivery.elapsedMs).toBeGreaterThanOrEqual(0);expect(delivery.elapsedMs).toBeLessThanOrEqual(120000)}
  await info.attach('TC-CS91-01-actual-current-recipient-delivery-timing',{body:Buffer.from(JSON.stringify(deliveryTiming,null,2)),contentType:'application/json'})
  for(const notice of notices){expect(notice.text).toContain(venue.name);expect(notice.text).toContain('Equipment failure');expect(notice.text).toContain('20 Nov 2028');expect(notice.text).toContain('09:30');expect(notice.text).toContain('16:45');expect(notice.text).toContain('Asia/Singapore');expect(notice.data.unavailability[0].startAt).toBe('2028-11-20T01:30:00.000Z');expect(notice.text).not.toContain('Private fault');expect(notice.link).toBeTruthy();expect(['a1000000-0000-4000-8000-000000000001',p.contact.id,second.contact.id]).toContain(notice.recipientId)}
  const attendeeNotices=(await reviewDatabase('notification',async db=>db.query('SELECT id FROM notifications WHERE "eventId"=$1 AND "recipientId" IN (SELECT unnest($2::text[]))',[p.event.eventId,['a1000000-0000-4000-8000-000000000013',...Array.from({length:19},(_,i)=>`review-attendee-${p.event.eventId}-${i+1}`)]]))).rows;expect(attendeeNotices).toEqual([])
  const available=await value(await staff.get(`/api/bookings/availability?venueId=${venue.id}&startAt=2028-11-20T00:00:00Z&endAt=2028-11-21T00:00:00Z`));expect(available.items.some((x:any)=>x.status==='BLOCKED'||x.status==='UNAVAILABLE')).toBe(true);expect(available.items.find((x:any)=>x.id===a.id).flags).toContain('AFFECTED_UNAVAILABLE')
  await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`);await expect(page.locator(`[data-booking-id="${a.id}"]`)).toContainText('Affected — alternative required')
  await page.locator(`[data-booking-id="${a.id}"]`).screenshot({path:info.outputPath('TC-CS91-01-06-08-16-19-23-affected-originals.png')});await evidence(page,info,'TC-CS91-01-03-06-08-10-13-16-19-23',p.event.eventId,[{database:'booking_db',query:'SELECT id,"eventId",status,flags FROM venue_booking_requests WHERE "eventId"=$1',rows:(await reviewDatabase('booking',async db=>db.query('SELECT id,"eventId",status,flags FROM venue_booking_requests WHERE "eventId"=$1',[second.event.eventId]))).rows}])
 }finally{await staff.dispose();await p.coordinator.dispose();await second.coordinator.dispose()}
})

test('TC-CS91-04 TC-CS91-05 TC-CS91-09 TC-CS91-11 TC-CS91-12 TC-CS91-14 TC-CS91-15 TC-CS91-17 LIVE operational categories, positive intervals, Staff-only writes and fresh-booking conflict enforcement',async({page,playwright,owner},info)=>{
 const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
 try{
  const venue=await createVenue(staff),room=await hold(p.coordinator,p.event.eventId,venue.id),body=blockBody(room,{startAt:'2028-11-20T06:00:00.000Z',endAt:'2028-11-20T07:00:00.000Z'})
  for(const actor of [owner,p.coordinator])expect((await mutation(actor,'POST','/api/bookings',body)).status()).toBe(403)
  for(const endAt of [body.startAt,'2028-11-20T05:00:00.000Z']){const invalid=await mutation(staff,'POST','/api/bookings',{...body,endAt});expect(invalid.status()).toBe(422);expect((await invalid.json()).data.error.fields.endAt).toContain('End time must be after start time')}
  const maintenance=await value(await mutation(staff,'POST','/api/bookings',{...body,startAt:'2028-11-20T07:00:00.000Z',endAt:'2028-11-20T08:00:00.000Z',unavailabilityCategory:'MAINTENANCE'}));expect(maintenance.unavailabilityCategory).toBe('MAINTENANCE');
  const one=await value(await mutation(staff,'POST','/api/bookings',{...body,endAt:'2028-11-20T06:01:00.000Z'}));expect(one.unavailabilityCategory).toBe('EQUIPMENT_FAILURE');expect(one.status).toBe('UNAVAILABLE')
  const denied=await mutation(p.coordinator,'POST','/api/bookings',roomInput(p.event.eventId,venue.id,{startAt:'2028-11-20T06:00:00.000Z',endAt:'2028-11-20T06:30:00.000Z'}));expect(denied.status()).toBe(409)
  const calendar=await value(await staff.get(`/api/bookings/availability?venueId=${venue.id}&startAt=${body.startAt}&endAt=${body.endAt}`));expect(calendar.items.some((r:any)=>r.id===one.id)).toBe(true)
  await evidence(page,info,'TC-CS91-04-05-09-11-12-14-15-17',p.event.eventId,[{database:'booking_db',query:'SELECT id,status,"unavailabilityCategory","unavailabilityNote" FROM venue_booking_requests WHERE id=$1',rows:(await reviewDatabase('booking',async db=>db.query('SELECT id,status,"unavailabilityCategory","unavailabilityNote" FROM venue_booking_requests WHERE id=$1',[one.id]))).rows}])
 }finally{await staff.dispose();await p.coordinator.dispose()}
})

test('TC-CS91-02 TC-CS91-20 TC-CS91-24 LIVE block removal retains affected flags, explicit restore clears only available original and rechecks the entire buffered interval',async({page,playwright,owner},info)=>{
 const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
 try{
  const venue=await createVenue(staff),a=await approve(staff,await hold(p.coordinator,p.event.eventId,venue.id)),b=await hold(p.coordinator,p.event.eventId,venue.id,{startAt:'2028-11-20T06:00:00.000Z',endAt:'2028-11-20T08:00:00.000Z'}),closure=await block(staff,a,{endAt:b.occupiedEnd})
  const shortBody={...closure.saved,endAt:a.occupiedEnd,reason:'Repair completed for the later session'}
  const preview=await value(await mutation(staff,'POST','/api/bookings/impact-preview',{...shortBody,bookingId:closure.saved.id}))
  const shortened=await value(await mutation(staff,'PUT',`/api/bookings/${closure.saved.id}`,{...shortBody,confirmImpact:true,impactFingerprint:preview.impactFingerprint}))
  let currentB=await current(staff,b.id);expect(currentB.flags).toContain('AFFECTED_UNAVAILABLE');expect((await current(staff,a.id)).flags).toContain('AFFECTED_UNAVAILABLE')
  expect((await mutation(staff,'POST',`/api/bookings/${b.id}/restore`,{version:currentB.version,reason:'Incomplete confirmation'})).status()).toBe(422)
  await value(await mutation(staff,'POST',`/api/bookings/${b.id}/restore`,{version:currentB.version,confirm:true,reason:'Staff checked the later full occupied window'}));expect((await current(staff,b.id)).flags).not.toContain('AFFECTED_UNAVAILABLE');expect((await current(staff,a.id)).flags).toContain('AFFECTED_UNAVAILABLE')
  await releaseBlock(staff,shortened);let currentA=await current(staff,a.id);expect(currentA.flags).toContain('AFFECTED_UNAVAILABLE')
  const touch=await block(staff,currentA,{startAt:'2028-11-20T00:00:00.000Z',endAt:currentA.occupiedStart})
  await value(await mutation(staff,'POST',`/api/bookings/${a.id}/restore`,{version:(await current(staff,a.id)).version,confirm:true,reason:'Closure ends exactly at setup start'}))
  await expect.poll(async()=> (await reviewDatabase('notification',async db=>db.query('SELECT id FROM notifications WHERE "eventId"=$1 AND type=\'BOOKING_RESTORED\'',[p.event.eventId]))).rows.length).toBe(4)
  await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`);await page.locator(`[data-booking-id="${a.id}"]`).screenshot({path:info.outputPath('TC-CS91-02-20-explicit-restoration-after-available-window.png')})
  const restoredProof=await page.context().newPage();await evidence(restoredProof,info,'TC-CS91-02-20-restored',p.event.eventId);await restoredProof.close()
  const overlapping=await block(staff,await current(staff,a.id),{startAt:'2028-11-20T00:00:00.000Z',endAt:new Date(Date.parse(currentA.occupiedStart)+60000).toISOString()})
  expect((await mutation(staff,'POST',`/api/bookings/${a.id}/restore`,{version:(await current(staff,a.id)).version,confirm:true,reason:'Must reject one minute setup overlap'})).status()).toBe(409)
  await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`);await page.screenshot({path:info.outputPath('TC-CS91-02-20-24-targeted-restoration.png'),fullPage:true});await evidence(page,info,'TC-CS91-02-20-24',p.event.eventId)
 }finally{await staff.dispose();await p.coordinator.dispose()}
})

test('TC-CS91-07 TC-CS91-18 LIVE operational boundaries use setup and turnaround with touching allowed and one-minute overlap flagged',async({page,playwright,owner},info)=>{
 const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
 try{
  const proof=[]
  for(const edge of ['setup','turnaround'])for(const offset of [-1,0,1]){
   const venue=await createVenue(staff),room=await approve(staff,await hold(p.coordinator,p.event.eventId,venue.id))
   const boundary=Date.parse(edge==='setup'?room.occupiedStart:room.occupiedEnd),at=new Date(boundary+offset*60000).toISOString()
   await block(staff,room,edge==='setup'?{startAt:new Date(boundary-3600000).toISOString(),endAt:at}:{startAt:at,endAt:new Date(boundary+3600000).toISOString()})
   const row=await current(staff,room.id),affected=edge==='setup'?offset>0:offset<0;expect(row.flags.includes('AFFECTED_UNAVAILABLE')).toBe(affected);proof.push({edge,offset,occupiedStart:room.occupiedStart,occupiedEnd:room.occupiedEnd,affected})
  }
  await info.attach('boundary-assertions',{body:Buffer.from(JSON.stringify(proof,null,2)),contentType:'application/json'});await evidence(page,info,'TC-CS91-07-18',p.event.eventId)
 }finally{await staff.dispose();await p.coordinator.dispose()}
})

test('TC-CS91-22 LIVE repeated impact-confirmed save creates one block, one affected flag and one notice per current recipient',async({page,playwright,owner},info)=>{
 const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
 try{
  const venue=await createVenue(staff),room=await approve(staff,await hold(p.coordinator,p.event.eventId,venue.id)),attempts:any[]=[];let acknowledged:any,injected=false
  await signIn(page,emails.staff);await page.clock.setFixedTime(new Date('2028-11-20T00:00:00.000Z'));await page.goto('/venue');await page.getByPlaceholder('Search venues...').fill(venue.name);await page.getByRole('button',{name:new RegExp(venue.name)}).click()
  await page.route('**/api/bookings',async route=>{
   if(route.request().method()!=='POST')return route.continue()
   attempts.push({method:route.request().method(),path:new URL(route.request().url()).pathname,key:route.request().headers()['idempotency-key'],body:route.request().postDataJSON()})
   const response=await route.fetch();if(!injected){expect(response.status()).toBe(200);acknowledged=await response.json();injected=true;await route.fulfill({status:503,json:{statusCode:503,statusMessage:'Controlled lost closure acknowledgement'}})}else await route.fulfill({response})
  })
  await page.getByRole('button',{name:'New unavailable window',exact:true}).click();const form=page.locator('form').filter({has:page.getByLabel('Start date and time')})
  await form.getByLabel('Start date and time').fill('2028-11-20T09:30');await form.getByLabel('End date and time').fill('2028-11-20T12:45');await form.getByLabel('Title',{exact:true}).fill('Acknowledgement recovery closure');await form.getByLabel('Reason',{exact:true}).fill('Staff explicitly confirms the affected interval once');await form.getByRole('button',{name:'Save booking',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Confirm affected bookings'});await dialog.getByRole('button',{name:'Confirm unavailable window',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('may have completed');expect(injected).toBe(true);await dialog.screenshot({path:info.outputPath('TC-CS91-22-committed-save-lost-acknowledgement.png')})
  await dialog.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Close booking form',exact:true}).click();await page.getByRole('button',{name:'New unavailable window',exact:true}).click();await page.getByRole('button',{name:'Close booking form',exact:true}).click();await page.getByRole('button').filter({hasText:room.title}).last().click();await expect(form.getByRole('button',{name:'Save changes',exact:true})).toBeDisabled()
  await page.getByRole('button',{name:'Retry previous save',exact:true}).click();await dialog.getByRole('button',{name:'Confirm unavailable window',exact:true}).click();await expect(dialog).toHaveCount(0);expect(attempts).toHaveLength(2);expect(attempts[1]).toEqual(attempts[0]);expect(attempts[1].method).toBe('POST');expect(attempts[1].path).toBe('/api/bookings')
  expect((await current(staff,room.id)).flags.filter((f:string)=>f==='AFFECTED_UNAVAILABLE')).toHaveLength(1)
  await expect.poll(async()=> (await reviewDatabase('notification',async db=>db.query('SELECT id FROM notifications WHERE "eventId"=$1 AND type IN (\'VENUE_UNAVAILABLE\',\'VENUE_CHANGE_NEEDED\')',[p.event.eventId]))).rows.length).toBe(2)
  const closures=(await reviewDatabase('booking',async db=>db.query('SELECT id,status FROM venue_booking_requests WHERE "venueId"=$1 AND status IN (\'BLOCKED\',\'UNAVAILABLE\')',[room.venueId]))).rows;expect(acknowledged.status).toBe(attempts[0].body.status);expect(closures).toEqual([{id:acknowledged.id,status:acknowledged.status}]);expect((await reviewDatabase('booking',async db=>db.query('SELECT id FROM booking_outbox WHERE "aggregateId"=$1 AND kind=\'VenueUnavailable\'',[room.id]))).rows).toHaveLength(1)
  await info.attach('TC-CS91-22-actual-ambiguous-save-retry',{body:Buffer.from(JSON.stringify({controlledPrecondition:'Browser calendar date20Nov2028; actual service clock unchanged; first committed HTTP acknowledgement replaced with503',attempts,acknowledgedId:acknowledged.id,closures},null,2)),contentType:'application/json'})
  await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`);await page.locator(`[data-booking-id="${room.id}"]`).screenshot({path:info.outputPath('TC-CS91-22-one-affected-booking-after-exact-ui-retry.png')})
  await evidence(page,info,'TC-CS91-22',p.event.eventId)
 }finally{await staff.dispose();await p.coordinator.dispose()}
})

test('TC-CS91-26 LIVE public closure edits refresh current actionable notices and suppress delayed stale facts',async({page,playwright,owner},info)=>{
 test.setTimeout(360000)
 const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner);let stopped=false
 try{
  const room=await approve(staff,await hold(p.coordinator,p.event.eventId,(await createVenue(staff)).id)),held=await hold(p.coordinator,p.event.eventId,room.venueId,{startAt:'2028-11-20T06:00:00.000Z',endAt:'2028-11-20T07:00:00.000Z'});broker('stop');stopped=true
  const closure=await block(staff,room,{unavailabilityCategory:'MAINTENANCE'}),flags=(await current(staff,room.id)).flags
  const query='SELECT id,payload FROM booking_outbox WHERE "aggregateId"=$1 AND kind=\'VenueUnavailable\' ORDER BY (payload->>\'version\')::int'
  expect((await reviewDatabase('booking',async db=>db.query(query,[room.id]))).rows).toHaveLength(1)
  const body={...closure.saved,endAt:'2028-11-20T06:30:00.000Z',unavailabilityCategory:'SAFETY_CONCERN',unavailabilityNote:'Private investigation update',reason:'Revise the operational period and public category'},preview=await value(await mutation(staff,'POST','/api/bookings/impact-preview',{...body,bookingId:closure.saved.id})),input={...body,confirmImpact:true,impactFingerprint:preview.impactFingerprint},key=randomUUID()
  const updated=await value(await mutation(staff,'PUT',`/api/bookings/${closure.saved.id}`,input,key));expect(await value(await mutation(staff,'PUT',`/api/bookings/${closure.saved.id}`,input,key))).toEqual(updated);expect((await current(staff,room.id)).flags).toEqual(flags)
  const privateBody={...await current(staff,closure.saved.id),unavailabilityNote:'Private-only second update'},privatePreview=await value(await mutation(staff,'POST','/api/bookings/impact-preview',{...privateBody,bookingId:closure.saved.id}));await value(await mutation(staff,'PUT',`/api/bookings/${closure.saved.id}`,{...privateBody,confirmImpact:true,impactFingerprint:privatePreview.impactFingerprint}))
  const intents=(await reviewDatabase('booking',async db=>db.query(query,[room.id]))).rows;expect(intents).toHaveLength(2);expect(intents[1].payload.unavailability[0]).toMatchObject({endAt:body.endAt,category:'SAFETY_CONCERN'});expect(JSON.stringify(intents.map((row:any)=>row.payload.unavailability))).not.toContain('Private')
  const heldIntents=(await reviewDatabase('booking',async db=>db.query(query,[held.id]))).rows;expect(heldIntents).toHaveLength(1)
  await reviewDatabase('booking',async db=>db.query('UPDATE venue_booking_requests SET "expiresAt"=clock_timestamp()-interval \'1 second\' WHERE id=$1',[held.id]));const expiredContext=internalRequest('booking',`/internal/notification-context/${held.id}`);expect(expiredContext.body.unavailability).toEqual([])
  const allIds=[...intents,...heldIntents].map((row:any)=>row.id);broker('start');stopped=false
  const receiptsQuery='SELECT "messageId",status FROM message_receipts WHERE "messageId"=ANY($1::text[]) ORDER BY "messageId"'
  await expect.poll(async()=> (await reviewDatabase('notification',async db=>db.query(receiptsQuery,[allIds]))).rows.map((row:any)=>row.status).sort(),{timeout:60000}).toEqual(['IGNORED','IGNORED','PROCESSED'])
  const notices=(await reviewDatabase('notification',async db=>db.query('SELECT id,"recipientId",type,text,"sourceMessageId" FROM notifications WHERE "sourceMessageId"=ANY($1::text[])',[allIds]))).rows;expect(notices).toHaveLength(2);expect(notices.every((row:any)=>row.sourceMessageId===intents[1].id&&row.text.includes('Safety concern')&&row.text.includes('14:30')&&!row.text.includes('Private'))).toBe(true)
  await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`);await page.getByTestId('bell').click();const notice=page.locator(`[data-notice-id="${notices.find((row:any)=>row.recipientId===p.contact.id).id}"]`);await expect(notice).toContainText('Safety concern');await notice.screenshot({path:info.outputPath('TC-CS91-26-current-public-period-notice.png')})
  const before=await page.context().newPage();await evidence(before,info,'TC-CS91-26-current-facts-delivered',p.event.eventId,[{database:'notification_db',query:receiptsQuery,rows:(await reviewDatabase('notification',async db=>db.query(receiptsQuery,[allIds]))).rows}]);await before.close()
  await releaseBlock(staff,await current(staff,closure.saved.id));expect((await current(staff,room.id)).flags).toContain('AFFECTED_UNAVAILABLE');const context=internalRequest('booking',`/internal/notification-context/${room.id}`);expect(context.body.unavailability).toEqual([])
  await page.reload();await page.locator(`[data-booking-id="${room.id}"]`).screenshot({path:info.outputPath('TC-CS91-26-retained-affected-after-closure-removal.png')});await info.attach('TC-CS91-26-current-source-and-delivery',{body:Buffer.from(JSON.stringify({intents,heldIntents,expiredContext,notices,afterRemovalContext:context},null,2)),contentType:'application/json'});await evidence(page,info,'TC-CS91-26-removed-block-retained-flag',p.event.eventId)
 }finally{if(stopped)broker('start');await staff.dispose();await p.coordinator.dispose()}
})
