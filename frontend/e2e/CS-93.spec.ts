import {expect} from '@playwright/test'
import {test,session,emails,signIn,mutation} from './helpers'
import {createVenue,planningEvent,hold} from './fixtures/venue-fixtures'
test('TC-CS93-30 LIVE Coordinator preparation shows current venue facts without enabling an unverified Safety action',async({page,playwright,owner},info)=>{
  const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner)
  try {
    const venue=await createVenue(staff),room=await hold(p.coordinator,p.event.eventId,venue.id)
    expect((await mutation(staff,'PUT',`/api/bookings/${room.id}/decision`,{version:room.version,status:'CONFIRMED',reason:'Room readiness checked'})).status()).toBe(200)
    await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`)
    const panel=page.getByRole('region',{name:'Safety preparation'})
    await expect(panel).toContainText('Venues ready');await expect(panel).toContainText('Technical/support approval has not been verified')
    await expect(panel.getByRole('button',{name:'Send for Safety Check',exact:true})).toBeDisabled()
    await panel.getByText('Review the current Safety factors',{exact:true}).click()
    await expect(panel).toContainText('80 / 120');await expect(panel).toContainText('Emergency access');await expect(panel).toContainText('Not recorded')
    await page.screenshot({path:info.outputPath('TC-CS93-30-current-factors-unverified-technical.png'),fullPage:true})
  }finally{await staff.dispose();await p.coordinator.dispose()}
})
