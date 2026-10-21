import { test, created, validRequest, assignedSession, session, emails, mutation, signIn, venueService } from './helpers'
import {createVenue,planningEvent,hold,reviewDatabase,databaseEvidence} from './fixtures/venue-fixtures'
import { expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'

test('TC-CS86-30 LIVE startup automatically rechecks legacy buffers and retains its completed receipt after restart',async({page,playwright,owner},info)=>{
  const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
  try {
    const venue=await createVenue(staff,{setupMinutes:0,turnaroundMinutes:0}),rooms=[]
    for(let i=0;i<2;i++){
      const room=await hold(p.coordinator,p.event.eventId,venue.id,{startAt:i?'2028-11-20T04:15:00Z':'2028-11-20T02:00:00Z',endAt:i?'2028-11-20T06:00:00Z':'2028-11-20T04:00:00Z'})
      const approved=await mutation(staff,'PUT',`/api/bookings/${room.id}/decision`,{version:room.version,status:'CONFIRMED',reason:'Approved under zero buffers'})
      expect(approved.status()).toBe(200);rooms.push(await approved.json())
    }
    // Fixture setup models a legacy catalogue at its first buffer rollout.
    // Only this unique venue is changed, while its service is stopped.
    venueService('stop')
    try {
      await reviewDatabase('venue',async db=>{
        await db.query('BEGIN')
        try {
          await db.query('UPDATE venues SET "turnaroundMinutes"=45,version=version+1 WHERE id=$1',[venue.id])
          await db.query('DELETE FROM venue_buffer_rollouts WHERE "venueId"=$1',[venue.id])
          await db.query('COMMIT')
        }catch(error){await db.query('ROLLBACK');throw error}
      })
    }finally{venueService('start')}
    await expect.poll(async()=> (await staff.get(`/api/venues/${venue.id}`)).status(),{timeout:45_000}).toBe(200)
    const query='SELECT id,status,version,flags,"occupiedStart","occupiedEnd" FROM venue_booking_requests WHERE "venueId"=$1 ORDER BY id'
    await expect.poll(async()=>{
      const result=await reviewDatabase('booking',async db=>db.query(query,[venue.id]))
      return result.rows.filter((row:any)=>row.flags.includes('BUFFER_CONFLICT')).length
    },{timeout:45_000}).toBe(2)
    const rolloutQuery='SELECT id,"venueId",version,attempts,"completedAt","completionReason",payload FROM venue_buffer_rollouts WHERE "venueId"=$1'
    await expect.poll(async()=>Boolean((await reviewDatabase('venue',async db=>db.query(rolloutQuery,[venue.id]))).rows[0]?.completedAt),{timeout:30_000}).toBe(true)
    const before=await reviewDatabase('booking',async db=>db.query(query,[venue.id]))
    expect(before.rows.map((row:any)=>row.status)).toEqual(['CONFIRMED','CONFIRMED'])
    const receipt=await reviewDatabase('venue',async db=>db.query(rolloutQuery,[venue.id]))
    expect(receipt.rows).toHaveLength(1);expect(receipt.rows[0].payload.actor).toEqual({id:'venue-buffer-rollout',role:'SYSTEM'})
    venueService('stop');venueService('start')
    await expect.poll(async()=> (await staff.get(`/api/venues/${venue.id}`)).status(),{timeout:45_000}).toBe(200)
    const after=await reviewDatabase('booking',async db=>db.query(query,[venue.id]))
    expect(after.rows).toEqual(before.rows)
    expect((await reviewDatabase('venue',async db=>db.query(rolloutQuery,[venue.id]))).rows).toEqual(receipt.rows)
    await signIn(page,emails.staff);await page.getByRole('button',{name:'Buffer conflicts',exact:true}).click()
    await page.getByRole('navigation',{name:'Flagged venue bookings'}).getByRole('button').filter({hasText:rooms[0].title}).click()
    await expect(page.locator('.conflict-pane')).toHaveCount(2)
    await page.screenshot({path:info.outputPath('TC-CS86-30-automatic-retained-conflicts.png'),fullPage:true})
    await databaseEvidence(page,info,'TC-CS86-30',[{database:'booking_db',query,rows:after.rows},{database:'venue_db',query:rolloutQuery,rows:receipt.rows}])
  }finally{await staff.dispose();await p.coordinator.dispose()}
})

test('TC-CS86-03 LIVE Staff compare retained approvals and recheck inherited buffer conflicts', async ({ page, playwright, owner }, testInfo) => {
  const staff = await session(playwright.request, emails.staff)
  const coordinators = []
  try {
    const suffix = randomUUID()
    const input = { name: `Conflict review ${suffix}`, address: 'Synthetic review venue', capacity: 120, venueType: 'PHYSICAL', supportedLayouts: ['THEATRE'], facilities: ['PROJECTOR'], accessibilityTags: [], timeZone: 'Asia/Singapore', managedById: 'a1000000-0000-4000-8000-000000000008', reason: 'Isolated inherited-conflict fixture', setupMinutes: 0, turnaroundMinutes: 0, operatingHours: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map(weekday => ({ weekday, isClosed: false, opensAt: '08:00', closesAt: '20:00' })) }
    const response = await mutation(staff, 'POST', '/api/venues', input)
    expect(response.status()).toBe(200)
    const venue = await response.json(), rooms = []
    for (let i = 0; i < 2; i++) {
      const submitted = await created(owner, 'submit', validRequest({ eventName: `Retained event ${i} ${suffix}`, expectedAttendance: 80, minimumCapacity: 80, accessibilityNeeds: [] }))
      const coordinator = await assignedSession(playwright.request, owner, submitted.id)
      coordinators.push(coordinator)
      const approved = await mutation(coordinator, 'POST', `/api/events/${submitted.id}/decision`, { decision: 'approve', version: submitted.version })
      expect(approved.status()).toBe(200)
      const event = await approved.json()
      const held = await mutation(coordinator, 'POST', '/api/bookings', { eventId: event.eventId, venueId: venue.id, title: `Retained event ${i} ${suffix}`, reason: 'Conference room', startAt: i ? '2028-11-20T04:15:00.000Z' : '2028-11-20T02:00:00.000Z', endAt: i ? '2028-11-20T06:00:00.000Z' : '2028-11-20T04:00:00.000Z', timeZone: 'Asia/Singapore', expectedAttendance: 80 })
      expect(held.status()).toBe(200)
      const room = await held.json()
      const decision = await mutation(staff, 'PUT', `/api/bookings/${room.id}/decision`, { version: room.version, status: 'CONFIRMED', reason: 'Capacity and layout verified' })
      expect(decision.status()).toBe(200)
      rooms.push(await decision.json())
    }
    // Session 3 disallows this as a user edit. Model the inherited rollout
    // explicitly in this isolated fixture, retaining both confirmed bookings.
    venueService('stop')
    try {
      await reviewDatabase('venue',async db=>{
        await db.query('BEGIN')
        try {
          await db.query('UPDATE venues SET "turnaroundMinutes"=45,version=version+1 WHERE id=$1',[venue.id])
          await db.query('DELETE FROM venue_buffer_rollouts WHERE "venueId"=$1',[venue.id])
          await db.query('COMMIT')
        }catch(error){await db.query('ROLLBACK');throw error}
      })
    }finally{venueService('start')}
    await expect.poll(async()=> (await staff.get(`/api/venues/${venue.id}`)).status(),{timeout:45_000}).toBe(200)
    await expect.poll(async()=>{
      const r=await reviewDatabase('booking',async db=>db.query('SELECT flags FROM venue_booking_requests WHERE "venueId"=$1',[venue.id]))
      return r.rows.filter((row:any)=>row.flags.includes('BUFFER_CONFLICT')).length
    },{timeout:45_000}).toBe(2)
    await signIn(page, emails.staff)
    await page.getByRole('button', { name: 'Buffer conflicts', exact: true }).click()
    await page.getByRole('navigation', { name: 'Flagged venue bookings' }).getByRole('button').filter({ hasText: rooms[0].title }).click()
    await expect(page.locator('.conflict-pane')).toHaveCount(2)
    for (const room of rooms) await expect(page.locator(`.conflict-pane[data-booking-id="${room.id}"]`)).toContainText('Venue approved')
    await expect(page.locator('.conflict-pane').first()).toContainText('12:45')
    await expect(page.locator('.conflict-pane').last()).toContainText('12:15')
    await page.screenshot({ path: testInfo.outputPath('CS-86-03-retained-conflict-windows.png'), fullPage: true })
    await page.getByText('Recheck existing bookings after buffer rollout', { exact: true }).click()
    await page.locator(`#recheck-reason-${venue.id}`).fill('Verify the initial buffer rollout')
    const section = page.locator(`#recheck-reason-${venue.id}`).locator('..').locator('..')
    await section.getByRole('button', { name: 'Recheck existing bookings', exact: true }).click()
    await expect(page.getByRole('status')).toContainText(`${venue.name}: recheck complete`)
    for (const room of rooms) {
      const current = await (await staff.get(`/api/bookings/${room.id}`)).json()
      expect(current.status).toBe('CONFIRMED')
      expect(current.flags).toContain('BUFFER_CONFLICT')
      const deletion = await mutation(staff, 'DELETE', `/api/bookings/${room.id}`, {})
      expect(deletion.status()).toBe(405)
    }
    await page.screenshot({ path: testInfo.outputPath('CS-86-09-audited-rollout-recheck.png'), fullPage: true })
  } finally {
    for (const coordinator of coordinators) await coordinator.dispose()
    await staff.dispose()
  }
})
