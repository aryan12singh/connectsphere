import {expect} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {test,session,emails,signIn} from './helpers'
import {createVenue,planningEvent} from './venue-fixtures'
test('TC-CS36-30 LIVE current Coordinator sees full and explicit partial matches and an empty result',async({page,playwright,owner},info)=>{
  const staff=await session(playwright.request,emails.staff),p=await planningEvent(playwright.request,owner),prefix=`Search evidence ${randomUUID()}`
  try {
    const full=await createVenue(staff,{name:prefix+' Full'}),partial=await createVenue(staff,{name:prefix+' Partial',facilities:[]})
    await signIn(page,p.contact.email);await page.goto(`/events/${p.event.eventId}`)
    await page.getByRole('button',{name:'Add another venue',exact:true}).click()
    await page.getByLabel('Projector',{exact:true}).check()
    await page.getByLabel('Location',{exact:true}).fill(prefix)
    await page.getByLabel('Room start (Asia/Singapore)',{exact:true}).fill('2028-11-20T10:00')
    await page.getByLabel('Room end (Asia/Singapore)',{exact:true}).fill('2028-11-20T12:00')
    await page.getByRole('button',{name:'Search available venues',exact:true}).click()
    const cards=page.locator('.venue-search-result');await expect(cards).toHaveCount(2)
    await expect(cards.nth(0)).toContainText(full.name);await expect(cards.nth(0)).toContainText('Full match')
    await expect(cards.nth(1)).toContainText(partial.name);await expect(cards.nth(1)).toContainText('Partial match');await expect(cards.nth(1)).toContainText('FACILITY:PROJECTOR')
    await page.getByLabel('Request reason',{exact:true}).fill('Capacity and facility assessment')
    await expect(cards.nth(0).getByRole('button')).toBeEnabled();await expect(cards.nth(1).getByRole('button')).toBeDisabled()
    await page.screenshot({path:info.outputPath('TC-CS36-30-full-partial.png'),fullPage:true})
    await page.getByLabel('Location',{exact:true}).fill(prefix+' Missing')
    await page.getByRole('button',{name:'Search available venues',exact:true}).click()
    await expect(page.getByText('No suitable available venues match these requirements.',{exact:true})).toBeVisible()
    await page.screenshot({path:info.outputPath('TC-CS36-30-empty-result.png'),fullPage:true})
  }finally{await staff.dispose();await p.coordinator.dispose()}
})
