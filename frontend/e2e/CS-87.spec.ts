import {test,created,validRequest,assignedSession,session,emails,mutation,signIn} from './helpers'
import {expect} from '@playwright/test'
import {randomUUID} from 'node:crypto'

test('TC-CS87-03 LIVE Coordinator requests independent rooms and Staff decisions update the real Event page',async({page,browser,playwright,owner},testInfo)=>{
  const submitted=await created(owner,'submit',validRequest({expectedAttendance:80,minimumCapacity:80,accessibilityNeeds:['Wheelchair accessible entrance & seating']}))
  const coordinator=await assignedSession(playwright.request,owner,submitted.id)
  const contact=await (await owner.get(`/api/events/${submitted.id}/coordinator`)).json()
  const staff=await session(playwright.request,emails.staff)
  const staffPage=await browser.newPage()
  try {
    const approval=await mutation(coordinator,'POST',`/api/events/${submitted.id}/decision`,{decision:'approve',version:submitted.version})
    expect(approval.status()).toBe(200);const event=await approval.json()
    const suffix=randomUUID(),venues=[]
    for(let i=0;i<2;i++){
      const response=await mutation(staff,'POST','/api/venues',{name:`Workflow room ${i} ${suffix}`,address:'Synthetic review venue',capacity:120,venueType:'PHYSICAL',supportedLayouts:['THEATRE'],facilities:['PROJECTOR'],accessibilityTags:['WHEELCHAIR_ACCESS'],timeZone:'Asia/Singapore',managedById:'a1000000-0000-4000-8000-000000000008',reason:'Isolated Sprint 3 browser fixture',setupMinutes:30,turnaroundMinutes:30,operatingHours:['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].map(weekday=>({weekday,isClosed:false,opensAt:'08:00',closesAt:'20:00'}))})
      expect(response.status()).toBe(200);venues.push(await response.json())
    }
    await signIn(page,contact.email)
    await page.goto(`/events/${event.eventId}`)
    await page.getByRole('button',{name:'Add another venue',exact:true}).click()
    await expect(page.getByLabel('Room attendance')).toHaveValue('80')
    await page.getByLabel('Room start (Asia/Singapore)',{exact:true}).fill('2028-11-20T10:00')
    await page.getByLabel('Room end (Asia/Singapore)',{exact:true}).fill('2028-11-20T12:00')
    await page.getByRole('button',{name:'Search available venues',exact:true}).click()
    await page.getByLabel('Request reason',{exact:true}).fill('Conference main and breakout rooms')
    for(const venue of venues){
      const card=page.locator('.venue-search-result').filter({has:page.getByRole('heading',{name:venue.name,exact:true})})
      await expect(card).toContainText('Full match')
      await card.getByRole('button',{name:'Request this venue',exact:true}).click()
      await expect(page.locator('.existing-booking').filter({hasText:venue.name})).toContainText('Hold expires')
    }
    let summary=await (await coordinator.get(`/api/bookings/events/${event.eventId}/summary`)).json()
    expect(summary.items).toHaveLength(2);expect(summary.venueReady).toBe(false)
    expect(summary.items.every((room:any)=>room.expectedAttendance===80 && room.version===1 && room.expiresAt)).toBe(true)
    await page.screenshot({path:testInfo.outputPath('CS-87-03-independent-holds.png'),fullPage:true})
    await signIn(staffPage,emails.staff)
    await staffPage.getByRole('button',{name:'Booking requests',exact:true}).click()
    const [first,second]=summary.items
    const firstCard=staffPage.locator(`[data-booking-id="${first.id}"]`)
    await firstCard.getByLabel('Decision or extension reason').fill('Capacity, layout and access verified')
    await firstCard.getByRole('button',{name:'Approve',exact:true}).click()
    await expect(firstCard).toHaveCount(0)
    const secondCard=staffPage.locator(`[data-booking-id="${second.id}"]`)
    await expect(secondCard.getByRole('button',{name:'Reject',exact:true})).toBeDisabled()
    await secondCard.getByLabel('Decision or extension reason').fill('Breakout room no longer required for this plan')
    await secondCard.getByRole('button',{name:'Reject',exact:true}).click()
    await expect(secondCard).toHaveCount(0)
    await page.getByRole('button',{name:'Refresh arrangements',exact:true}).click()
    const rejected=page.locator(`[data-booking-id="${second.id}"]`)
    await expect(rejected).toContainText('rejected')
    await expect(page.locator(`#venue-outstanding`)).toContainText(second.venueName)
    await rejected.getByLabel('Reason for releasing this room').fill('Retire this request and retain the main room')
    await rejected.getByRole('button',{name:'Release this booking',exact:true}).click()
    await expect(page.getByText('All required venues are approved for the current requirements.',{exact:true})).toBeVisible()
    summary=await (await coordinator.get(`/api/bookings/events/${event.eventId}/summary`)).json()
    expect(summary.venueReady).toBe(true);expect(summary.items.map((r:any)=>r.status).sort()).toEqual(['CANCELLED','CONFIRMED'])
    await page.screenshot({path:testInfo.outputPath('CS-87-07-required-room-ready.png'),fullPage:true})
    const replay=await mutation(staff,'PUT',`/api/bookings/${first.id}/decision`,{version:1,status:'CONFIRMED',reason:'Stale duplicate'})
    expect(replay.status()).toBe(409)
  }finally{await coordinator.dispose();await staff.dispose();await staffPage.close()}
})
