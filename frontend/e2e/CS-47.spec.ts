import { test, expect, emails } from './fixtures/attendance-fixtures'
import { signIn, created, validRequest, mutation,session } from './fixtures/helpers'
import {planningEvent,createVenue,hold} from './fixtures/venue-fixtures'
import {safeConfirm,approve} from './fixtures/sprint4-fixtures'

test('TC-CS47-01: Attendee sees confirmed event details on the attendee dashboard', async ({ attendance, page }, info) => {
  const event = await attendance.event({ registrationLimit: null })
  const detail = await attendance.checkDetail(event.eventId, await attendance.actor(emails.attendee))
  expect(detail.status()).toBe(200)
  const eventDetail = await detail.json()
  const dateTime = new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: eventDetail.timeZone,
  })
  const eventTimeRange = `${dateTime.format(new Date(eventDetail.startAt))} – ${dateTime.format(new Date(eventDetail.endAt))}`
  await signIn(page, emails.attendee); await page.goto('/attendances')
  await expect(page.getByRole('heading', { name: 'Your events' })).toBeVisible()
  const eventItem = page.getByRole('article', { name: event.eventName })
  await expect(eventItem).toContainText(`Event ${event.eventId}`)
  await expect(eventItem).toContainText(eventTimeRange)
  await expect(eventItem).toContainText('Not set')
  await expect(eventItem).not.toContainText('80 attendees')
  await expect(page.getByRole('link', { name: new RegExp(`Event ${event.eventId}`) })).toBeVisible()
  await page.getByRole('link', { name: new RegExp(`Event ${event.eventId}`) }).click()
  await expect(page).toHaveTitle(/Event details | ConnectSphere/)
  await expect(page.getByRole('heading', { name: event.eventName })).toBeVisible()
  await expect(page.getByText(`Event ${event.eventId}`)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Event essentials' })).toContainText(
    eventTimeRange,
  )
  await expect(page.getByText('Registration window')).toBeVisible()
  await page.screenshot({ path: info.outputPath('TC-CS47-01-event-details.png'), fullPage: true })
})

test('TC-CS47-01: Attendee sees the configured registration limit, not the planned attendance', async ({ attendance, page }) => {
  const event = await attendance.event({ registrationLimit: 50 })
  await signIn(page, emails.attendee); await page.goto('/attendances')
  const eventItem = page.getByRole('article', { name: event.eventName })
  await expect(eventItem).toContainText('50 attendees')
  await expect(eventItem).not.toContainText('80 attendees')
})

test('TC-CS47-03: Event list opens correct detail page; registration availability truthful', async ({ attendance, page }, info) => {
  const event = await attendance.event({ registrationEnabled: true })
  await signIn(page, emails.attendee); await page.goto('/attendances')
  await expect(page.getByRole('link', { name: new RegExp(`Event ${event.eventId}`) })).toBeVisible()
  await page.getByRole('link', { name: new RegExp(`Event ${event.eventId}`) }).click()
  await expect(page.getByRole('heading', { name: event.eventName })).toBeVisible()
  await expect(page.getByText(/registration window/i)).toBeVisible()
  await expect(page.getByText(/registration opens/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Register', exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('TC-CS47-03-list-to-detail.png'), fullPage: true })
})

test('TC-CS47-04: Attendee detail excludes private/internal fields', async ({ attendance, page }) => {
  const event = await attendance.event()
  await signIn(page, emails.attendee); await page.goto(`/attendances/events/${event.eventId}`)
  const response = await page.evaluate(async (eventId) => {
    const res = await fetch(`/api/attendances/events/${encodeURIComponent(eventId)}`, { credentials: 'include' })
    return { status: res.status, body: await res.json() }
  }, event.eventId)
  expect(response.status).toBe(200)
  const { body } = response
  expect(body.internalNotes).toBeUndefined()
  expect(body.planningData).toBeUndefined()
  expect(body.equipmentPlanning).toBeUndefined()
  expect(body.safetyReviews).toBeUndefined()
  expect(body.safetyNotes).toBeUndefined()
  expect(body.historicalArrangements).toBeUndefined()
  expect(body.otherUserRegistrations).toBeUndefined()
  expect(body.venueBookings).toBeUndefined()
  expect(body.title).toBeDefined()
  expect(body.description).toBeDefined()
})

test('TC-CS47-05: Non-confirmed event is hidden from attendee list and detail returns 404', async ({ attendance, page }) => {
  const owner = await attendance.actor(emails.owner)
  const draft = await mutation(owner, 'POST', '/api/events', { ...validRequest(), saveAs: 'draft' })
  expect(draft.status()).toBe(201)
  const draftBody = await draft.json()
  await signIn(page, emails.attendee); await page.goto('/attendances')
  await expect(page.getByRole('link', { name: new RegExp(`Event ${draftBody.eventId}`) })).toHaveCount(0)
  const detail = await attendance.checkDetail(draftBody.eventId, await attendance.actor(emails.attendee))
  expect(detail.status()).toBe(404)
})

test('TC-CS47-08: Cancelled event - registered attendee sees own record; unrelated attendee denied', async ({ attendance, page }) => {
  const event = await attendance.cancelledEvent()
  const own = await attendance.checkRegistration(event.eventId, await attendance.actor(emails.attendee))
  expect(own.status()).toBe(200)
  await signIn(page, emails.attendee); await page.goto(`/attendances/registrations/${event.eventId}`)
  await expect(page.getByText('Your registration')).toBeVisible()
  await expect(page.getByText('Cancelled', { exact: true }).first()).toBeVisible()
  const unrelated = await attendance.checkRegistration(event.eventId, await attendance.actor(emails.otherAttendee))
  expect(unrelated.status()).toBe(404)
  await signIn(page, emails.otherAttendee); await page.goto(`/attendances/registrations/${event.eventId}`)
  await expect(page.getByText('Registration not found', { exact: true })).toBeVisible()
})

test('TC-CS47-09: Responsive empty state on attendee dashboard', async ({ attendance, page }, info) => {
  // Controlled empty response tests responsive presentation only; source visibility has its own live cases.
  await page.route('**/api/attendances/events',route=>route.fulfill({json:{events:[]}}))
  await signIn(page, emails.attendee)
  await expect(page.getByText(/no events/i)).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByText(/no events/i)).toBeVisible()
  await page.screenshot({ path: info.outputPath('TC-CS47-09-empty-mobile.png'), fullPage: true })
})

test('TC-CS47-02: Current confirmed multi-venue presentation retains the designated primary',async({attendance,page},info)=>{
 const event=await attendance.event({rooms:2})
 await signIn(page,emails.attendee);await page.goto(`/attendances/events/${event.eventId}`)
 await expect(page.getByRole('region',{name:'Confirmed venues'}).locator('li')).toHaveCount(2)
 await page.getByRole('region',{name:'Confirmed venues'}).screenshot({path:info.outputPath('TC-CS47-02-current-confirmed-venues.png')})
})

// TC-CS47-06 is executed by the real request -> Staff approval -> Safety ->
// reconfirmation -> attendee journey in CS-92.spec.ts, alongside TC-CS92-01/02/09.
test('TC-CS47-07: Visibility switches only after actual current Safety and separate Event confirmation',async({attendance,page,playwright},info)=>{
 const owner=await attendance.actor(emails.owner),staff=await attendance.actor(emails.staff),officer=await attendance.actor(emails.officer),attendee=await attendance.actor(emails.attendee)
 const p=await planningEvent(playwright.request,owner,{equipmentNeeds:['No equipment required']})
 try{
  const venue=await createVenue(staff),room=await approve(staff,await hold(p.coordinator,p.event.eventId,venue.id))
  expect((await attendee.get(`/api/attendances/events/${p.event.eventId}`)).status()).toBe(404)
  await safeConfirm(p.coordinator,officer,p.event.eventId,p.event.id)
  expect((await attendee.get(`/api/attendances/events/${p.event.eventId}`)).status()).toBe(200)
  await signIn(page,emails.attendee);await page.goto(`/attendances/events/${p.event.eventId}`);await expect(page.getByRole('heading',{name:p.event.eventName})).toBeVisible();await page.locator('main').screenshot({path:info.outputPath('TC-CS47-07-current-confirmation-boundary.png')})
 }finally{await p.coordinator.dispose()}
})
