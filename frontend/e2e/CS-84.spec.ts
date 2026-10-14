import {expect} from '@playwright/test'
import {test,session,emails,signIn} from './helpers'
import {createVenue,planningEvent,hold,reviewDatabase,databaseEvidence} from './venue-fixtures'
import {mutation} from './helpers'
test('TC-CS84-39 TC-CS84-41 LIVE coordinated legacy buffers preserve approvals and first-confirmation flexibility',async({page,playwright,owner},info)=>{
  const staff=await session(playwright.request,emails.staff),a=await planningEvent(playwright.request,owner),b=await planningEvent(playwright.request,owner)
  try{
    const venue=await createVenue(staff,{setupMinutes:0,turnaroundMinutes:0})
    const first=await hold(a.coordinator,a.event.eventId,venue.id,{startAt:'2028-11-20T02:00:00.000Z',endAt:'2028-11-20T03:00:00.000Z'})
    const second=await hold(b.coordinator,b.event.eventId,venue.id,{startAt:'2028-11-20T03:00:00.000Z',endAt:'2028-11-20T04:00:00.000Z'})
    for(const room of [first,second]){
      const current=await (await staff.get(`/api/bookings/${room.id}`)).json()
      const approved=await mutation(staff,'PUT',`/api/bookings/${room.id}/decision`,{version:current.version,status:'CONFIRMED',reason:'Existing approved arrangement'})
      expect(approved.status(),await approved.text()).toBe(200)
    }
    // Explicit pre-policy fixture; eligibility migration is tested separately.
    await reviewDatabase('venue',db=>db.query('UPDATE venues SET "legacyBufferConfigurationPending"=true WHERE id=$1',[venue.id]))
    const context=await (await staff.get(`/api/venues/${venue.id}/legacy-buffer-context`)).json()
    expect(context.affectedEvents).toHaveLength(2)
    await signIn(page,emails.staff);await page.goto(`/venue/${venue.id}`)
    const panel=page.getByRole('region',{name:'Coordinated initial buffer configuration'})
    await panel.getByLabel('Initial setup time (minutes)').fill('30');await panel.getByLabel('Initial turnaround time (minutes)').fill('45')
    await expect(panel.getByRole('button',{name:'Save initial buffers',exact:true})).toBeDisabled()
    for(const contact of context.affectedEvents){
      await page.locator(`#legacy-staff-${contact.eventId}`).click();await page.locator(`#legacy-organiser-${contact.eventId}`).click();await page.locator(`#legacy-note-${contact.eventId}`).fill('Staff discussed 30/45 minutes with current Coordinator; Coordinator confirmed Organiser informed.')
    }
    await panel.getByLabel('Initial buffer configuration reason').fill('Coordinated initial buffer policy for inherited arrangements')
    await panel.screenshot({path:info.outputPath('TC-CS84-39-communication.png')})
    await panel.getByRole('button',{name:'Save initial buffers',exact:true}).click();await expect(panel).toHaveCount(0)
    await expect(page.getByLabel('Setup time (minutes)',{exact:true})).toBeDisabled()
    for(const room of [first,second])await expect.poll(async()=>{const r=await (await staff.get(`/api/bookings/${room.id}`)).json();return {status:r.status,conflict:r.flags?.includes('BUFFER_CONFLICT')}},{timeout:20000}).toEqual({status:'CONFIRMED',conflict:true})
    const saved=await (await staff.get(`/api/venues/${venue.id}`)).json();expect(saved.legacyBufferConfigurationPending).toBe(false)
    expect((await mutation(staff,'PUT',`/api/venues/${venue.id}/legacy-buffers`,{version:saved.version,setupMinutes:0,turnaroundMinutes:0,reason:'Forbidden second configuration',communications:[]})).status()).toBe(409)
    const query='SELECT v.id,v."setupMinutes",v."turnaroundMinutes",v."legacyBufferConfigurationPending",v."buffersLockedAt",h.action,h."actorId",h.changes FROM venues v JOIN venue_history h ON h."venueId"=v.id WHERE v.id=$1 AND h.action=$2'
    const rows=(await reviewDatabase<any>('venue',db=>db.query(query,[venue.id,'LEGACY_BUFFERS_CONFIGURED']))).rows
    expect(rows).toHaveLength(1);expect(rows[0].changes.communications).toHaveLength(2)
    await databaseEvidence(page,info,'TC-CS84-39',[{database:'venue_db',query,rows}])
    const empty=await createVenue(staff,{setupMinutes:0,turnaroundMinutes:0})
    await reviewDatabase('venue',db=>db.query('UPDATE venues SET "legacyBufferConfigurationPending"=true,"buffersLockedAt"=CURRENT_TIMESTAMP WHERE id=$1',[empty.id]))
    await page.goto(`/venue/${empty.id}`)
    const initial=page.getByRole('region',{name:'Coordinated initial buffer configuration'})
    await initial.getByLabel('Initial setup time (minutes)').fill('30');await initial.getByLabel('Initial buffer configuration reason').fill('Initial policy; no Event commitments require consultation')
    await initial.getByRole('button',{name:'Save initial buffers',exact:true}).click();await expect(initial).toHaveCount(0)
    await expect(page.getByLabel('Setup time (minutes)',{exact:true})).toBeEnabled()
    const unlocked=await (await staff.get(`/api/venues/${empty.id}`)).json();expect(unlocked.buffersLockedAt).toBeNull();expect(unlocked.legacyBufferConfigurationPending).toBe(false)
    await page.getByLabel('Setup time (minutes)',{exact:true}).fill('60');await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByLabel('Reason or note').fill('Flexible before the first confirmed booking');await page.getByRole('button',{name:'Continue',exact:true}).click();await expect(page).toHaveURL(/\/venue$/)
    expect((await (await staff.get(`/api/venues/${empty.id}`)).json()).setupMinutes).toBe(60)
  }finally{await staff.dispose();await a.coordinator.dispose();await b.coordinator.dispose()}
})
test('TC-CS84-30 LIVE Staff buffer form persists an audited version without altering venue hours',async({page,playwright},info)=>{
  const staff=await session(playwright.request,emails.staff)
  try {
    const venue=await createVenue(staff,{setupMinutes:0,turnaroundMinutes:0})
    await signIn(page,emails.staff);await page.goto(`/venue/${venue.id}`)
    await page.getByLabel('Setup time (minutes)',{exact:true}).fill('30')
    await page.getByLabel('Turnaround time (minutes)',{exact:true}).fill('45')
    await page.screenshot({path:info.outputPath('TC-CS84-30-buffer-form.png'),fullPage:true})
    await page.getByRole('button',{name:'Save changes',exact:true}).click()
    await page.getByLabel('Reason or note').fill('Initial setup and turnaround policy')
    await page.getByRole('button',{name:'Continue',exact:true}).click();await expect(page).toHaveURL(/\/venue$/)
    const saved=await (await staff.get(`/api/venues/${venue.id}`)).json()
    expect(saved.setupMinutes).toBe(30);expect(saved.turnaroundMinutes).toBe(45);expect(saved.version).toBe(2)
    expect(saved.operatingHours.map((h:any)=>({weekday:h.weekday,opensAt:h.opensAt,closesAt:h.closesAt}))).toEqual(venue.operatingHours.map((h:any)=>({weekday:h.weekday,opensAt:h.opensAt,closesAt:h.closesAt})))
    const query='SELECT id,"setupMinutes","turnaroundMinutes",version FROM venues WHERE id=$1'
    const rows=(await reviewDatabase('venue',async db=>db.query(query,[venue.id]))).rows
    await databaseEvidence(page,info,'TC-CS84-30',[{database:'venue_db',query,rows}])
  }finally{await staff.dispose()}
})
