import {expect} from '@playwright/test'
import {test,session,emails,signIn,mutation} from './helpers'
import {createVenue,planningEvent,roomInput,reviewDatabase,databaseEvidence} from './venue-fixtures'
test('TC-CS39-30 TC-CS39-32 LIVE simultaneous room requests commit one winner with no orphan',async({page,playwright,owner},info)=>{
  const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
  try {
    const venue=await createVenue(staff),body=roomInput(p.event.eventId,venue.id)
    const responses=await Promise.all([mutation(p.coordinator,'POST','/api/bookings',body),mutation(p.coordinator,'POST','/api/bookings',{...body,title:body.title+' competing'})])
    expect(responses.map(r=>r.status()).sort()).toEqual([200,409])
    const refused=responses.find(r=>r.status()===409)!;expect((await refused.json()).data.error.code).toBe('VENUE_CONFLICT')
    const query='SELECT id,"eventId","venueId",status,"expiresAt",version FROM venue_booking_requests WHERE "eventId"=$1 AND "venueId"=$2'
    const result=await reviewDatabase('booking',async db=>db.query(query,[p.event.eventId,venue.id]));expect(result.rows).toHaveLength(1)
    await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`)
    await expect(page.locator('.existing-booking')).toHaveCount(1)
    await page.screenshot({path:info.outputPath('TC-CS39-30-single-committed-room.png'),fullPage:true})
    await signIn(page,emails.staff);await page.getByTestId('bell').click()
    const notices=page.getByRole('dialog',{name:'Notifications'})
    await expect(notices).toContainText('New booking request')
    const notificationRows=await reviewDatabase('notification',async db=>(await db.query('SELECT id,type,\"sourceMessageId\",\"recipientId\" FROM notifications WHERE \"eventId\"=$1',[p.event.eventId])).rows)
    expect(notificationRows.some((row:any)=>row.type==='NEW_BOOKING_REQUEST')).toBe(true)
    await page.screenshot({path:info.outputPath('TC-CS39-32-real-rabbit-inbox.png'),fullPage:true})
    await databaseEvidence(page,info,'TC-CS39-32',[{database:'notification_db',query:'Current Event notice source message IDs for '+p.event.eventId,rows:notificationRows}])
    await databaseEvidence(page,info,'TC-CS39-30',[{database:'booking_db',query,rows:result.rows}])
  }finally{await staff.dispose();await p.coordinator.dispose()}
})
