import {expect} from '@playwright/test'
import {session,emails,signIn} from './helpers'
import {createVenue,planningEvent,hold,roomInput} from './fixtures/venue-fixtures'
import {test,mutation,value,current,summary,approve,block,blockBody,releaseBlock,evidence,reviewDatabase,registrations} from './fixtures/sprint4-fixtures'

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
  const room=await approve(staff,await hold(p.coordinator,p.event.eventId,(await createVenue(staff)).id)),closure=await block(staff,room)
  expect(await value(await mutation(staff,'POST','/api/bookings',closure.input,closure.key))).toEqual(closure.saved)
  expect((await current(staff,room.id)).flags.filter((f:string)=>f==='AFFECTED_UNAVAILABLE')).toHaveLength(1)
  await expect.poll(async()=> (await reviewDatabase('notification',async db=>db.query('SELECT id FROM notifications WHERE "eventId"=$1 AND type IN (\'VENUE_UNAVAILABLE\',\'VENUE_CHANGE_NEEDED\')',[p.event.eventId]))).rows.length).toBe(2)
  const closures=(await reviewDatabase('booking',async db=>db.query('SELECT id FROM venue_booking_requests WHERE "venueId"=$1 AND status=\'UNAVAILABLE\'',[room.venueId]))).rows;expect(closures).toEqual([{id:closure.saved.id}])
  await evidence(page,info,'TC-CS91-22',p.event.eventId)
 }finally{await staff.dispose();await p.coordinator.dispose()}
})
