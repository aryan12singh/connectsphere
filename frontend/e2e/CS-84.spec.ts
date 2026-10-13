import {expect} from '@playwright/test'
import {test,session,emails,signIn} from './helpers'
import {createVenue,reviewDatabase,databaseEvidence} from './venue-fixtures'
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
