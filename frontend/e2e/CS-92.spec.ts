import {expect} from '@playwright/test'
import {session,emails,signIn} from './helpers'
import {createVenue,planningEvent,hold} from './fixtures/venue-fixtures'
import {test,mutation,value,current,summary,approve,block,releaseBlock,replace,reviewedBody,cancel,evidence,reviewDatabase,safeConfirm,registrations,internalRequest} from './fixtures/sprint4-fixtures'

test('TC-CS92-01 TC-CS92-02 TC-CS92-08 TC-CS92-09 TC-CS91-21 TC-CS47-06 LIVE linked replacement and Staff approval preserve history, registrations and siblings; current Safety reconfirmation publishes the effective attendee venues',async({page,browser,playwright,owner},info)=>{
 test.setTimeout(480000)
 const staff=await session(playwright.request,emails.staff),officer=await session(playwright.request,emails.officer),attendee=await session(playwright.request,emails.attendee),p=await planningEvent(playwright.request,owner,{equipmentNeeds:['No equipment required']})
 const staffPage=await browser.newPage()
 try{
  const originalVenue=await createVenue(staff),candidate=await createVenue(staff),siblingVenue=await createVenue(staff)
  const original=await approve(staff,await hold(p.coordinator,p.event.eventId,originalVenue.id,{expectedAttendance:40})),sibling=await approve(staff,await hold(p.coordinator,p.event.eventId,siblingVenue.id,{expectedAttendance:40}))
  await value(await mutation(p.coordinator,'PUT',`/api/bookings/events/${p.event.eventId}/primary-venue`,{bookingId:original.id,bookingVersion:original.version,version:0}))
  await safeConfirm(p.coordinator,officer,p.event.eventId,p.event.id);await registrations(p.event.eventId,20,original)
  const initialSafety=await value(await p.coordinator.get(`/api/safety/events/${p.event.eventId}`))
  const publicBefore=await value(await attendee.get(`/api/attendances/events/${p.event.eventId}`));expect(publicBefore.primaryVenueName).toBe(originalVenue.name)
  await block(staff,original)
  const disruptedSafety=await value(await p.coordinator.get(`/api/safety/events/${p.event.eventId}`));expect(disruptedSafety.state).toBe('STALE');expect(disruptedSafety.round.id).toBe(initialSafety.round.id)
  expect((await attendee.get(`/api/attendances/events/${p.event.eventId}`)).status()).toBe(404)
  const affected=await current(staff,original.id),before=(await summary(p.coordinator,p.event.eventId)).event
  await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`)
  await page.locator(`[data-booking-id="${original.id}"]`).getByRole('button',{name:'Find replacement',exact:true}).click()
  await page.getByLabel('Location',{exact:true}).fill(candidate.name);await page.getByRole('button',{name:'Search available venues',exact:true}).click()
  await page.getByLabel('Change reason',{exact:true}).fill('Use the available alternative while retaining the other rooms')
  await page.locator('.venue-search-result').filter({hasText:candidate.name}).getByRole('button',{name:'Request replacement',exact:true}).click()
  await expect(page.locator(`[data-booking-id="${original.id}"]`)).toContainText('Affected — replacement requested')
  const pending=await summary(p.coordinator,p.event.eventId),replacement=pending.items.find((r:any)=>r.originalBookingId===original.id)
  expect(replacement.status).toBe('TENTATIVELY_HELD');expect((await current(staff,original.id)).status).toBe('CONFIRMED');expect(pending.event.title).toBe(before.title);expect(pending.event.startAt).toBe(before.startAt);expect(pending.event.endAt).toBe(before.endAt)
  await page.locator(`[data-booking-id="${original.id}"]`).screenshot({path:info.outputPath('TC-CS92-08-original-and-pending-replacement.png')})
  const pendingProof=await page.context().newPage();await evidence(pendingProof,info,'TC-CS92-08-pending-before-Staff-approval',p.event.eventId);await pendingProof.close()
  await signIn(staffPage,emails.staff);await staffPage.goto('/venue');await staffPage.getByRole('button',{name:/Booking requests/}).click()
  const review=staffPage.locator(`[data-booking-id="${replacement.id}"]`);await expect(review).toContainText(original.id);await review.getByLabel('Decision or extension reason').fill('Suitable alternative checked for the complete occupied interval');await review.getByRole('button',{name:'Approve',exact:true}).click();await expect(review).toHaveCount(0)
  const after=await summary(p.coordinator,p.event.eventId);expect(after.items.find((r:any)=>r.id===original.id).status).toBe('REPLACED');expect(after.items.find((r:any)=>r.id===replacement.id).status).toBe('CONFIRMED');expect(await current(staff,sibling.id)).toMatchObject(sibling);expect(after.primaryVenue.bookingId).toBe(replacement.id)
  const unsafe=await value(await p.coordinator.get(`/api/safety/events/${p.event.eventId}`));expect(unsafe.state).toBe('STALE');expect(unsafe.round.id).toBe(initialSafety.round.id);const refusedConfirmation=await mutation(p.coordinator,'POST',`/api/safety/events/${p.event.eventId}/confirm`,{version:unsafe.event.version});expect(refusedConfirmation.status()).toBe(409);expect(JSON.stringify(await refusedConfirmation.json())).toContain('CURRENT_SAFETY_REQUIRED')
  expect((await attendee.get(`/api/attendances/events/${p.event.eventId}`)).status()).toBe(404)
  expect((await mutation(staff,'POST',`/api/bookings/${original.id}/restore`,{version:after.items.find((r:any)=>r.id===original.id).version,confirm:true,reason:'Must not revive replaced room'})).status()).toBe(409)
  const noticeQuery='SELECT type,count(*)::int AS count FROM notifications WHERE "eventId"=$1 AND type=\'VENUE_CHANGED\' GROUP BY type'
  expect((await reviewDatabase('notification',async db=>db.query(noticeQuery,[p.event.eventId]))).rows).toEqual([])
  const safetyQuery='SELECT e.id,e.status,e."safetyState",e."safetyRoundId",r.id AS "roundId",r.number,r.status AS "roundStatus" FROM events e LEFT JOIN safety_rounds r ON r."eventId"=e.id WHERE e.id=$1 ORDER BY r.number',safetyRows=(await reviewDatabase('event',async db=>db.query(safetyQuery,[p.event.eventId]))).rows;expect(safetyRows).toHaveLength(1);expect(safetyRows[0]).toMatchObject({status:'ARRANGEMENT_PENDING',safetyState:'STALE',roundId:initialSafety.round.id,number:1,roundStatus:'SUPERSEDED'})
  await page.reload();const safetyRegion=page.getByRole('region',{name:'Safety preparation',exact:true});await expect(safetyRegion).toContainText('stale');await expect(safetyRegion.getByRole('button',{name:'Confirm Event',exact:true})).toHaveCount(0);await safetyRegion.screenshot({path:info.outputPath('TC-CS92-09-current-Safety-required-before-reconfirmation.png')});const safetyProof=await page.context().newPage();await evidence(safetyProof,info,'TC-CS92-09-current-Safety-required-before-reconfirmation',p.event.eventId,[{database:'event_db',query:safetyQuery,rows:safetyRows}]);await safetyProof.close()
  await safeConfirm(p.coordinator,officer,p.event.eventId,p.event.id)
  await expect.poll(async()=> (await reviewDatabase('notification',async db=>db.query(noticeQuery,[p.event.eventId]))).rows).toEqual([{type:'VENUE_CHANGED',count:21}])
  const registrationIds=(await reviewDatabase('attendance',async db=>db.query('SELECT \"userId\" FROM registrations WHERE \"eventId\"=$1 AND status=\'CONFIRMED\'',[p.event.eventId]))).rows.map((row:any)=>row.userId);const recipients=(await reviewDatabase('notification',async db=>db.query('SELECT \"recipientId\" FROM notifications WHERE \"eventId\"=$1 AND type=\'VENUE_CHANGED\'',[p.event.eventId]))).rows.map((row:any)=>row.recipientId);expect(recipients.sort()).toEqual([...registrationIds,'a1000000-0000-4000-8000-000000000001'].sort())
  const final=await value(await attendee.get(`/api/attendances/events/${p.event.eventId}`));expect(final.primaryVenueName).toBe(candidate.name);expect(final.venues.map((r:any)=>r.name).sort()).toEqual([candidate.name,siblingVenue.name].sort());expect(JSON.stringify(final)).not.toContain(originalVenue.name);expect(JSON.stringify(final)).not.toContain('Private review')
  const ownerDetail=await value(await owner.get(`/api/attendances/events/${p.event.eventId}/organiser`));expect(ownerDetail.venues.map((row:any)=>row.name).sort()).toEqual([candidate.name,siblingVenue.name].sort());expect(JSON.stringify(ownerDetail)).not.toContain('Private review')
  const unrelated=await session(playwright.request,emails.other);try{expect((await unrelated.get(`/api/attendances/events/${p.event.eventId}/organiser`)).status()).toBe(403)}finally{await unrelated.dispose()}
  expect((await mutation(attendee,'POST','/api/attendances/sync',{eventId:p.event.eventId,registrationLimit:99999})).status()).toBe(405)
  expect((await reviewDatabase('attendance',async db=>db.query('SELECT count(*)::int AS count FROM registrations WHERE "eventId"=$1 AND status=\'CONFIRMED\'',[p.event.eventId]))).rows[0].count).toBe(20)
  await signIn(page,emails.attendee);await page.goto(`/attendances/events/${p.event.eventId}`);await expect(page.getByRole('region',{name:'Confirmed venues'})).toContainText(candidate.name);await expect(page.locator('main')).not.toContainText(originalVenue.name)
  await page.locator('main').screenshot({path:info.outputPath('TC-CS92-01-02-09-CS47-06-effective-attendee-venues.png')})
  await evidence(page,info,'TC-CS92-01-02-08-09-CS91-21-CS47-06',p.event.eventId,[{database:'attendance_db',query:'SELECT status,count(*)::int AS count FROM registrations WHERE \"eventId\"=$1 GROUP BY status',rows:(await reviewDatabase('attendance',async db=>db.query('SELECT status,count(*)::int AS count FROM registrations WHERE \"eventId\"=$1 GROUP BY status',[p.event.eventId]))).rows}])
 }finally{await staffPage.close();await staff.dispose();await officer.dispose();await attendee.dispose();await p.coordinator.dispose()}
})

test('TC-CS92-03 TC-CS92-12 LIVE source search preserves date, time, attendance, layout, facilities and accessibility while excluding the unavailable venue',async({page,playwright,owner},info)=>{
 const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner,{expectedAttendance:200,minimumCapacity:200,accessibilityNeeds:['Wheelchair accessible entrance & seating']})
 try{
  const venue=await createVenue(staff,{capacity:240,accessibilityTags:['WHEELCHAIR_ACCESS']}),candidate=await createVenue(staff,{capacity:240,accessibilityTags:['WHEELCHAIR_ACCESS']}),source=await approve(staff,await hold(p.coordinator,p.event.eventId,venue.id,{expectedAttendance:200,accessibilityNeeds:['WHEELCHAIR_ACCESS']}))
  await block(staff,source);let room=await current(staff,source.id)
  const search=await value(await p.coordinator.get(`/api/bookings/events/${p.event.eventId}/venue-search?bookingId=${room.id}&bookingVersion=${room.version}`));expect(search.criteria).toMatchObject({startAt:source.startAt,endAt:source.endAt,expectedAttendance:200,layout:'THEATRE',facilities:['PROJECTOR'],accessibilityNeeds:['WHEELCHAIR_ACCESS']});expect(search.items.some((r:any)=>r.id===venue.id)).toBe(false);expect(search.items.find((r:any)=>r.id===candidate.id).canRequest).toBe(true)
  const noticeQuery='SELECT id FROM notifications WHERE "eventId"=$1 AND type=\'VENUE_UNAVAILABLE\' AND "recipientId"=$2';await expect.poll(async()=> (await reviewDatabase('notification',async db=>db.query(noticeQuery,[p.event.eventId,p.contact.id]))).rows.length).toBe(1)
  const notice=(await reviewDatabase('notification',async db=>db.query(noticeQuery,[p.event.eventId,p.contact.id]))).rows[0]
  await signIn(page,p.contact.email)
  let release!:()=>void,paused=false
  const hydration=new Promise<void>(resolve=>{release=resolve})
  await page.route('**/_nuxt/**',async route=>{if(route.request().resourceType()==='script'){paused=true;await hydration}await route.continue()})
  const bell=page.getByTestId('bell')
  try{
   await page.goto('/',{waitUntil:'commit'});await expect.poll(()=>paused).toBe(true)
   await expect(bell).toBeDisabled();await expect(bell).toHaveAttribute('aria-expanded','false')
   await bell.screenshot({path:info.outputPath('TC-CS92-03-bell-disabled-before-hydration.png')})
  }finally{release()}
  await page.unrouteAll({behavior:'wait'});await expect(bell).toBeEnabled();await bell.click()
  await expect(page.getByRole('dialog',{name:'Notifications',exact:true})).toBeVisible()
  const notification=page.locator(`[data-notice-id="${notice.id}"]`);await expect(notification).toContainText(venue.name);await notification.screenshot({path:info.outputPath('TC-CS92-03-actionable-unavailability-notice.png')});await notification.click();await expect(page).toHaveURL(new RegExp(`/events/${p.event.eventId}$`));await page.locator(`[data-booking-id="${room.id}"]`).getByRole('button',{name:'Find replacement',exact:true}).click();await expect(page.getByLabel('Room attendance',{exact:true})).toHaveValue('200');await expect(page.getByRole('combobox',{name:'Room layout',exact:true})).toHaveValue('THEATRE');await expect(page.getByLabel('Projector',{exact:true})).toBeChecked()
  await page.locator('form').screenshot({path:info.outputPath('TC-CS92-03-prefilled-200-attendee-search.png')})
  const originalProof=await page.context().newPage();await evidence(originalProof,info,'TC-CS92-03-prefilled-200',p.event.eventId);await originalProof.close()
  // Separate allocation proves the supplemental180-attendee source case.
  await reviewDatabase('booking',async db=>db.query('UPDATE venue_booking_requests SET "expectedAttendance"=180 WHERE id=$1',[room.id]))
  room=await current(staff,room.id);const supplement=await value(await p.coordinator.get(`/api/bookings/events/${p.event.eventId}/venue-search?bookingId=${room.id}&bookingVersion=${room.version}`));expect(supplement.criteria.expectedAttendance).toBe(180);expect(supplement.criteria.layout).toBe('THEATRE');expect(supplement.criteria.accessibilityNeeds).toContain('WHEELCHAIR_ACCESS');expect(supplement.criteria.facilities).toContain('PROJECTOR')
  await page.reload();await page.locator(`[data-booking-id="${room.id}"]`).getByRole('button',{name:'Find replacement',exact:true}).click();await expect(page.getByLabel('Room attendance',{exact:true})).toHaveValue('180');await expect(page.getByRole('combobox',{name:'Room layout',exact:true})).toHaveValue('THEATRE');await expect(page.getByLabel('Projector',{exact:true})).toBeChecked();await page.locator('form').screenshot({path:info.outputPath('TC-CS92-12-prefilled-180-attendee-search.png')})
  await evidence(page,info,'TC-CS92-12-prefilled-180',p.event.eventId)
 }finally{await staff.dispose();await p.coordinator.dispose()}
})

test('TC-CS92-04 TC-CS92-05 TC-CS92-06 LIVE current assignment, fresh rejection recovery and hard capacity remain enforced for linked replacements',async({page,playwright,owner},info)=>{
 const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner,{expectedAttendance:100,minimumCapacity:100}),other=await session(playwright.request,p.contact.email==='meiling.chua@connectsphere.sg'?emails.coordinator:'meiling.chua@connectsphere.sg')
 try{
  const original=await approve(staff,await hold(p.coordinator,p.event.eventId,(await createVenue(staff)).id,{expectedAttendance:100}));await block(staff,original);let source=await current(staff,original.id)
  expect((await other.get(`/api/bookings/${source.id}`)).status()).toBe(403)
  const small=await createVenue(staff,{capacity:80}),smallInput=await reviewedBody(p.coordinator,source,'REPLACEMENT',{...source,venueId:small.id,expiresAt:undefined,status:'TENTATIVELY_HELD',reason:'Capacity must be rejected'})
  expect((await mutation(p.coordinator,'POST',`/api/bookings/${source.id}/replacements`,smallInput)).status()).toBe(422)
  const candidate=await createVenue(staff),pending=await replace(p.coordinator,source,candidate),rejected=await approve(staff,pending,'REJECTED');expect(rejected.status).toBe('REJECTED');source=await current(staff,source.id);expect(source.flags).toContain('AFFECTED_UNAVAILABLE')
  const retry=await replace(p.coordinator,source,await createVenue(staff));expect(retry.originalBookingId).toBe(source.id);expect(retry.status).toBe('TENTATIVELY_HELD');expect((await current(staff,source.id)).status).toBe('CONFIRMED')
  await evidence(page,info,'TC-CS92-04-05-06',p.event.eventId)
 }finally{await staff.dispose();await other.dispose();await p.coordinator.dispose()}
})

test('TC-CS92-07 LIVE replacements admit touching occupied windows and refuse one-minute setup overlap',async({page,playwright,owner},info)=>{
 const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
 try{
  const original=await approve(staff,await hold(p.coordinator,p.event.eventId,(await createVenue(staff)).id));await block(staff,original);const source=await current(staff,original.id),candidate=await createVenue(staff)
  await hold(p.coordinator,p.event.eventId,candidate.id,{startAt:'2028-11-20T02:00:00.000Z',endAt:'2028-11-20T05:15:00.000Z'})
  const overlap={...source,venueId:candidate.id,startAt:'2028-11-20T06:29:00.000Z',endAt:'2028-11-20T07:00:00.000Z',status:'TENTATIVELY_HELD',expiresAt:undefined,reason:'Refuse one minute of setup overlap'}
  const rejected=await reviewedBody(p.coordinator,source,'REPLACEMENT',overlap);expect((await mutation(p.coordinator,'POST',`/api/bookings/${source.id}/replacements`,rejected)).status()).toBe(409)
  const touching=await replace(p.coordinator,source,candidate,{startAt:'2028-11-20T06:30:00.000Z',endAt:'2028-11-20T07:00:00.000Z'});expect(touching.occupiedStart).toBe('2028-11-20T06:00:00.000Z')
  await evidence(page,info,'TC-CS92-07',p.event.eventId)
 }finally{await staff.dispose();await p.coordinator.dispose()}
})

test('TC-CS92-10 TC-CS92-11 LIVE explicit Coordinator withdrawal precedes Staff restoration; approval and restoration retries leave one effective arrangement',async({page,playwright,owner},info)=>{
 test.setTimeout(480000)
 const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
 try{
  const outcomes=[]
  for(let i=0;i<20;i++){
   const original=await approve(staff,await hold(p.coordinator,p.event.eventId,(await createVenue(staff)).id)),closure=await block(staff,original),source=await current(staff,original.id),pending=await replace(p.coordinator,source,await createVenue(staff))
   await releaseBlock(staff,closure.saved);const refreshed=await current(staff,source.id)
   if(i%2===0){
    const results=await Promise.all([mutation(staff,'POST',`/api/bookings/${source.id}/restore`,{version:refreshed.version,confirm:true,reason:'Concurrent restoration requires Coordinator withdrawal'}),mutation(staff,'PUT',`/api/bookings/${pending.id}/decision`,{version:pending.version,originalVersion:refreshed.version,status:'CONFIRMED',reason:'Approve current linked replacement'})]);expect(results.map(r=>r.status()).sort()).toEqual([200,409])
   }else{
    expect((await mutation(staff,'POST',`/api/bookings/${source.id}/restore`,{version:refreshed.version,confirm:true,reason:'No silent withdrawal'})).status()).toBe(409)
    const withdrawal=await cancel(p.coordinator,pending),withdrawn=await value(withdrawal.response);expect(withdrawn.statusChangedById).toBe(p.contact.id)
    if(i===1){await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`);await page.locator(`[data-booking-id="${source.id}"]`).screenshot({path:info.outputPath('TC-CS92-10-11-original-still-affected-after-explicit-withdrawal.png')});const before=await page.context().newPage();await evidence(before,info,'TC-CS92-10-11-withdrawn-before-restoration',p.event.eventId);await before.close()}
    const results=await Promise.all([mutation(staff,'POST',`/api/bookings/${source.id}/restore`,{version:refreshed.version,confirm:true,reason:'Coordinator explicitly withdrew pending alternative'}),mutation(staff,'PUT',`/api/bookings/${pending.id}/decision`,{version:pending.version,originalVersion:refreshed.version,status:'CONFIRMED',reason:'Stale approval must lose'})]);expect(results.map(r=>r.status()).sort()).toEqual([200,409])
    const availability=await value(await staff.get(`/api/bookings/availability?venueId=${pending.venueId}&startAt=${pending.occupiedStart}&endAt=${pending.occupiedEnd}`));expect(availability.items.some((r:any)=>r.id===pending.id)).toBe(false)
   }
   const a=await current(staff,source.id),b=await current(staff,pending.id);const effective=[a,b].filter(row=>row.status==='CONFIRMED'&&!row.flags.includes('AFFECTED_UNAVAILABLE'));expect(effective).toHaveLength(1);outcomes.push({run:i+1,originalStatus:a.status,originalAffected:a.flags.includes('AFFECTED_UNAVAILABLE'),replacementStatus:b.status,effective:effective[0].id})
   if(i===1){await page.reload();await page.locator(`[data-booking-id="${source.id}"]`).screenshot({path:info.outputPath('TC-CS92-10-11-original-restored-after-Staff-confirmation.png')});const after=await page.context().newPage();await evidence(after,info,'TC-CS92-10-11-restored-original-after-withdrawal',p.event.eventId);await after.close()}
  }
  await info.attach('twenty-restore-approval-race-results',{body:Buffer.from(JSON.stringify(outcomes,null,2)),contentType:'application/json'});await evidence(page,info,'TC-CS92-10-11',p.event.eventId)
 }finally{await staff.dispose();await p.coordinator.dispose()}
})

test('TC-CS92-02 TC-CS52-02 LIVE final effective time change reaches registered and waitlisted Attendees, skips Withdrawn and preserves all registration states',async({page,playwright,owner},info)=>{
 test.setTimeout(360000)
 const staff=await session(playwright.request,emails.staff),officer=await session(playwright.request,emails.officer),p=await planningEvent(playwright.request,owner,{equipmentNeeds:['No equipment required']})
 try{
  const venue=await createVenue(staff),room=await approve(staff,await hold(p.coordinator,p.event.eventId,venue.id))
  await registrations(p.event.eventId,1,room)
  const waitlisted='a1000000-0000-4000-8000-000000000014',withdrawn='withdrawn-'+p.event.eventId
  await reviewDatabase('attendance',async db=>{for(const [userId,status] of [[waitlisted,'WAITLISTED'],[withdrawn,'WITHDRAWN']])await db.query('INSERT INTO registrations(id,"eventId","userId",status,"registeredAt") VALUES($1,$2,$3,$4,now())',['audience-'+p.event.eventId+'-'+userId,p.event.eventId,userId,status])})
  const privatePath=`/internal/events/${p.event.eventId}/notification-recipients`,sourceRecipients=internalRequest('attendance',privatePath);expect(sourceRecipients.status).toBe(200);expect(sourceRecipients.body.items.sort()).toEqual(['a1000000-0000-4000-8000-000000000013',waitlisted].sort())
  // Even the valid service key cannot route an internal namespace through Kong.
  const gateway=await playwright.request.newContext();try{expect((await gateway.get(`${process.env.KONG_BASE||'http://127.0.0.1:38000'}/attendances${privatePath}`,{headers:{'x-internal-api-key':'change-me-dev-internal-key'}})).status()).toBe(404)}finally{await gateway.dispose()}
  await safeConfirm(p.coordinator,officer,p.event.eventId,p.event.id)
  const body=await reviewedBody(p.coordinator,room,'CHANGE',{...room,startAt:'2028-11-20T03:00:00.000Z',endAt:'2028-11-20T05:00:00.000Z',status:'TENTATIVELY_HELD',reason:'Move the effective session time after current Coordinator review'})
  const changed=await value(await mutation(p.coordinator,'PUT',`/api/bookings/${room.id}`,body));await approve(staff,changed);await safeConfirm(p.coordinator,officer,p.event.eventId,p.event.id)
  const query='SELECT id,type,"recipientId",text,data FROM notifications WHERE "eventId"=$1 AND type=\'VENUE_CHANGED\''
  await expect.poll(async()=> (await reviewDatabase('notification',async db=>db.query(query,[p.event.eventId]))).rows.map((row:any)=>row.recipientId).sort()).toEqual(['a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000013',waitlisted].sort())
  const notices=(await reviewDatabase('notification',async db=>db.query(query,[p.event.eventId]))).rows
  expect(notices.some((row:any)=>row.recipientId===withdrawn)).toBe(false);expect(notices.every((row:any)=>!JSON.stringify(row.data).includes('Private review'))).toBe(true)
  const registrationsQuery='SELECT "userId",status FROM registrations WHERE "eventId"=$1 ORDER BY "userId"',states=(await reviewDatabase('attendance',async db=>db.query(registrationsQuery,[p.event.eventId]))).rows;expect(states.map((row:any)=>row.status).sort()).toEqual(['CONFIRMED','WAITLISTED','WITHDRAWN'])
  await signIn(page,emails.otherAttendee);await page.goto(`/attendances/events/${p.event.eventId}`);await expect(page.getByRole('region',{name:'Confirmed venues'})).toContainText('11:00');await page.getByTestId('bell').click();const notice=page.locator(`[data-notice-id="${notices.find((row:any)=>row.recipientId===waitlisted).id}"]`);await expect(notice).toContainText(venue.name);await notice.screenshot({path:info.outputPath('TC-CS92-02-waitlisted-final-notice.png')})
  await evidence(page,info,'TC-CS92-02-CS52-02-registered-waitlisted-withdrawn',p.event.eventId,[{database:'attendance_db',query:registrationsQuery,rows:states}])
 }finally{await staff.dispose();await officer.dispose();await p.coordinator.dispose()}
})

test('TC-CS92-16 LIVE expired replacement requires a fresh original review and cannot approve beside its restored source',async({page,playwright,owner},info)=>{
 const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
 try{
  const original=await approve(staff,await hold(p.coordinator,p.event.eventId,(await createVenue(staff)).id)),sibling=await approve(staff,await hold(p.coordinator,p.event.eventId,(await createVenue(staff)).id,{startAt:'2028-11-20T07:00:00.000Z',endAt:'2028-11-20T08:00:00.000Z'})),closure=await block(staff,original),candidate=await createVenue(staff)
  await registrations(p.event.eventId,20,original)
  const pending=await replace(p.coordinator,await current(staff,original.id),candidate)
  await reviewDatabase('booking',async db=>db.query('UPDATE venue_booking_requests SET "expiresAt"=clock_timestamp()-interval \'1 second\' WHERE id=$1',[pending.id]))
  const body={...pending,expiresAt:undefined,status:'TENTATIVELY_HELD',reason:'An expired pending replacement needs a fresh original review'},denied=await mutation(p.coordinator,'POST',`/api/bookings/${pending.id}/resubmit`,body)
  expect(denied.status()).toBe(409);expect(JSON.stringify(await denied.json())).toContain('REPLACEMENT_REVIEW_REQUIRED');expect((await summary(p.coordinator,p.event.eventId)).items).toHaveLength(3)
  await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`);const expiredCard=page.locator(`[data-booking-id="${pending.id}"]`);await expect(expiredCard).toContainText('freshly reviewed alternative');await expect(expiredCard.getByRole('button',{name:'Resubmit expired hold',exact:true})).toHaveCount(0);await expect(page.locator(`[data-booking-id="${original.id}"]`).getByRole('button',{name:'Find replacement',exact:true})).toBeVisible();await expiredCard.screenshot({path:info.outputPath('TC-CS92-16-expired-pending-replacement-retains-lineage.png')})
  const before=await page.context().newPage();await evidence(before,info,'TC-CS92-16-refused-orphan-before-fresh-review',p.event.eventId);await before.close()
  const fresh=await replace(p.coordinator,await current(staff,original.id),candidate);expect(fresh.originalBookingId).toBe(original.id);expect(fresh.changeReviewId).toBeTruthy()
  await reviewDatabase('booking',async db=>db.query('UPDATE venue_booking_requests SET "expiresAt"=clock_timestamp()-interval \'1 second\' WHERE id=$1',[fresh.id]))
  await releaseBlock(staff,closure.saved);await value(await mutation(staff,'POST',`/api/bookings/${original.id}/restore`,{version:(await current(staff,original.id)).version,confirm:true,reason:'Staff confirmed the original full occupied window after alternatives expired'}))
  for(const expired of [pending,fresh])expect((await mutation(staff,'PUT',`/api/bookings/${expired.id}/decision`,{version:expired.version,status:'CONFIRMED',reason:'Expired alternative must not approve alongside the restored original'})).status()).toBe(409)
  const final=await summary(p.coordinator,p.event.eventId);expect(final.items.filter((row:any)=>(row.id===original.id||row.originalBookingId===original.id)&&row.effectiveStatus==='CONFIRMED'&&!row.flags.includes('AFFECTED_UNAVAILABLE'))).toHaveLength(1);expect(final.venueReady).toBe(true);expect(await current(staff,sibling.id)).toMatchObject(sibling)
  const registrationQuery='SELECT status,count(*)::int AS count FROM registrations WHERE "eventId"=$1 GROUP BY status',rows=(await reviewDatabase('attendance',async db=>db.query(registrationQuery,[p.event.eventId]))).rows;expect(rows).toEqual([{status:'CONFIRMED',count:20}])
  await page.reload();await page.locator(`[data-booking-id="${original.id}"]`).screenshot({path:info.outputPath('TC-CS92-16-one-restored-original-expired-alternatives-refused.png')});await evidence(page,info,'TC-CS92-16',p.event.eventId,[{database:'attendance_db',query:registrationQuery,rows}])
 }finally{await staff.dispose();await p.coordinator.dispose()}
})

test('TC-CS92-17 LIVE completed replacement accepts a later reviewed time change without reviving its original',async({page,playwright,owner},info)=>{
 test.setTimeout(480000)
 const staff=await session(playwright.request,emails.staff),officer=await session(playwright.request,emails.officer),p=await planningEvent(playwright.request,owner,{equipmentNeeds:['No equipment required']})
 try{
  const original=await approve(staff,await hold(p.coordinator,p.event.eventId,(await createVenue(staff)).id)),candidate=await createVenue(staff)
  await value(await mutation(p.coordinator,'PUT',`/api/bookings/events/${p.event.eventId}/primary-venue`,{bookingId:original.id,bookingVersion:original.version,version:0}))
  await registrations(p.event.eventId,20,original);await safeConfirm(p.coordinator,officer,p.event.eventId,p.event.id);await block(staff,original)
  const replacement=await approve(staff,await replace(p.coordinator,await current(staff,original.id),candidate)),retained=await current(staff,original.id)
  await safeConfirm(p.coordinator,officer,p.event.eventId,p.event.id)
  const input=await reviewedBody(p.coordinator,replacement,'CHANGE',{...replacement,startAt:'2028-11-20T03:00:00.000Z',endAt:'2028-11-20T05:00:00.000Z',status:'TENTATIVELY_HELD',reason:'Move the already approved replacement session after current review'})
  let changed=await value(await mutation(p.coordinator,'PUT',`/api/bookings/${replacement.id}`,input)),pending=await summary(p.coordinator,p.event.eventId)
  expect(pending.items.find((row:any)=>row.id===original.id)).toMatchObject({status:'REPLACED',replacementBookingId:null})
  await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`);const oldCard=page.locator(`[data-booking-id="${original.id}"]`);await expect(oldCard).toContainText('replaced');await expect(oldCard.locator('.replacement-comparison')).toHaveCount(0);await oldCard.screenshot({path:info.outputPath('TC-CS92-17-original-stays-replaced-during-later-review.png')})
  changed=await approve(staff,changed);expect(changed.status).toBe('CONFIRMED');expect(await current(staff,original.id)).toMatchObject(retained)
  const again=await reviewedBody(p.coordinator,changed,'CHANGE',{...changed,startAt:'2028-11-20T05:00:00.000Z',endAt:'2028-11-20T06:00:00.000Z',status:'TENTATIVELY_HELD',reason:'Fresh time revision for the completed replacement'})
  changed=await value(await mutation(p.coordinator,'PUT',`/api/bookings/${changed.id}`,again));await reviewDatabase('booking',async db=>db.query('UPDATE venue_booking_requests SET "expiresAt"=clock_timestamp()-interval \'1 second\' WHERE id=$1',[changed.id]))
  await page.reload();const expired=page.locator(`[data-booking-id="${changed.id}"]`);await expect(expired.getByRole('button',{name:'Resubmit expired hold',exact:true})).toBeVisible();await expired.screenshot({path:info.outputPath('TC-CS92-17-completed-lineage-expiry-can-resubmit.png')});await expired.getByRole('button',{name:'Resubmit expired hold',exact:true}).click()
  await page.getByLabel('Location',{exact:true}).fill(candidate.name);await page.getByRole('button',{name:'Search available venues',exact:true}).click();await page.getByLabel('Change reason',{exact:true}).fill('Fresh request after the completed replacement hold expired');await page.locator('.venue-search-result').filter({hasText:candidate.name}).getByRole('button',{name:'Submit fresh hold',exact:true}).click()
  const query='SELECT id,"resubmittedFromId","originalBookingId" FROM venue_booking_requests WHERE "resubmittedFromId"=$1';await expect.poll(async()=> (await reviewDatabase('booking',async db=>db.query(query,[changed.id]))).rows.length).toBe(1)
  const recovered=(await reviewDatabase('booking',async db=>db.query(query,[changed.id]))).rows[0];expect(recovered.originalBookingId).toBeNull();await approve(staff,await current(staff,recovered.id))
  let final=await summary(p.coordinator,p.event.eventId);expect(final.venueReady).toBe(true);expect(await current(staff,original.id)).toMatchObject(retained)
  await value(await mutation(p.coordinator,'PUT',`/api/bookings/events/${p.event.eventId}/primary-venue`,{bookingId:recovered.id,bookingVersion:(await current(staff,recovered.id)).version,version:final.primaryVenue.version}))
  await safeConfirm(p.coordinator,officer,p.event.eventId,p.event.id);final=await summary(p.coordinator,p.event.eventId);expect(final.primaryVenue).toMatchObject({bookingId:recovered.id,available:true});expect(final.event.status).toBe('CONFIRMED')
  expect((await reviewDatabase('booking',async db=>db.query('SELECT id FROM booking_outbox WHERE "aggregateId"=$1 AND kind=\'VenueReplacementApproved\'',[replacement.id]))).rows).toHaveLength(1)
  expect((await reviewDatabase('attendance',async db=>db.query('SELECT count(*)::int AS count FROM registrations WHERE "eventId"=$1 AND status=\'CONFIRMED\'',[p.event.eventId]))).rows[0].count).toBe(20)
  await page.reload();await page.locator(`[data-booking-id="${recovered.id}"]`).screenshot({path:info.outputPath('TC-CS92-17-recovered-completed-lineage-approved.png')});await evidence(page,info,'TC-CS92-17',p.event.eventId,[{database:'booking_db',query,rows:[recovered]}])
 }finally{await staff.dispose();await officer.dispose();await p.coordinator.dispose()}
})
