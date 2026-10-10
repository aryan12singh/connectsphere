import { expect, type Locator } from '@playwright/test'
import { created, emails, field, mutation, session, signIn, test, validRequest } from './helpers'

async function coordinatorFor(owner: Parameters<typeof created>[0], requestId: string) {
  const response = await owner.get(`/api/events/${requestId}/coordinator`)
  expect(response.status()).toBe(200)
  const assignment = await response.json()
  expect(assignment?.email).toBeTruthy()
  return assignment.email as string
}

const technicalBody = {
  version: 1,
  equipment: [
    { equipmentType: 'projector', quantity: 2 },
    { equipmentType: 'speaker', quantity: 1 },
  ],
  supportRequired: true,
  supportDetails: 'Please assist with setup',
  placementDetails: 'Projector at the front of the hall',
  notRequired: false,
}

async function activate(locator: Locator) {
  await locator.focus()
  await locator.press('Enter')
}

test('CS-40 TC-01/05: assigned Coordinator submits equipment and support requirements through the page', async ({ page, playwright, owner }, testInfo) => {
  const consoleErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', error => consoleErrors.push(error.message))
  const event = await created(owner, 'submit', validRequest())
  const coordinator = await coordinatorFor(owner, event.id)
  const coordinatorSession = await session(playwright.request, coordinator)
  const serverRendered = await coordinatorSession.get(`/technical-requirements/${event.id}`)
  expect(serverRendered.status()).toBe(200)
  expect(await serverRendered.text()).toMatch(/<button[^>]*disabled[^>]*>Submit requirements<\/button>/)

  await signIn(page, coordinator)
  await page.goto(`/technical-requirements/${event.id}`)

  await expect(page).toHaveTitle('Technical requirements | ConnectSphere')
  await expect(page.getByRole('heading', { name: 'Technical requirements', exact: true })).toBeVisible()
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /width=device-width/)
  if (testInfo.project.name === 'mobile') {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  }
  await expect(page.getByRole('button', { name: 'Submit requirements', exact: true })).toBeEnabled()
  await field(page, 'projector quantity').fill('2')
  await field(page, 'speaker quantity').fill('1')
  await expect(field(page, 'projector quantity')).toHaveValue('2')
  await expect(page.getByTestId('selected-equipment')).toHaveText('Selected equipment: projector — 2, speaker — 1')
  await page.getByLabel('Technical support is required').check()
  await page.getByLabel('Support details').fill('Please assist with setup')
  await page.getByLabel('Placement and preparation details').fill('Projector at the front of the hall')
  await activate(page.getByRole('button', { name: 'Submit requirements', exact: true }))
  await expect(page.getByText('Submitted for Technical Support review', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('cs40-technical-requirements.png'), fullPage: true })

  try {
    const saved = await coordinatorSession.get(`/api/events/${event.id}/technical-request`)
    expect(saved.status()).toBe(200)
    expect(await saved.json()).toMatchObject({ status: 'SUBMITTED', equipment: technicalBody.equipment, supportRequired: true })
    expect(consoleErrors).toEqual([])
  }
  finally { await coordinatorSession.dispose() }
})

test('CS-40 TC-02: page blocks an empty request and API validation rejects unknown equipment and invalid quantity', async ({ page, playwright, owner }) => {
  const event = await created(owner, 'submit', validRequest())
  const email = await coordinatorFor(owner, event.id)
  await signIn(page, email)
  await page.goto(`/technical-requirements/${event.id}`)
  await page.getByLabel('Placement and preparation details').fill('Front of hall')
  await activate(page.getByRole('button', { name: 'Submit requirements', exact: true }))
  await expect(page.getByRole('alert')).toContainText('Specify equipment or support')

  const coordinator = await session(playwright.request, email)
  try {
    const response = await mutation(coordinator, 'POST', `/api/events/${event.id}/technical-request`, {
      ...technicalBody,
      equipment: [{ equipmentType: 'unlisted equipment', quantity: 0 }],
    })
    expect(response.status()).toBe(422)
    const failure = await response.json()
    expect(failure.data?.error?.fields ?? failure.error?.fields).toMatchObject({
      'equipment.0.equipmentType': expect.any(Array),
      'equipment.0.quantity': expect.any(Array),
    })
  }
  finally { await coordinator.dispose() }
})

test('CS-40 TC-03/04: Technical Support cannot reject without a reason and the Coordinator sees the recorded rejection', async ({ page, playwright, owner }) => {
  const event = await created(owner, 'submit', validRequest())
  const email = await coordinatorFor(owner, event.id)
  const coordinator = await session(playwright.request, email)
  try {
    const submission = await mutation(coordinator, 'POST', `/api/events/${event.id}/technical-request`, technicalBody)
    expect(submission.status()).toBe(200)
  }
  finally { await coordinator.dispose() }

  await signIn(page, emails.support)
  await page.goto('/technical-requests')
  await expect(page.getByRole('heading', { name: 'Technical requirements review', exact: true })).toBeVisible()
  await expect(page.getByText(`Event request ${event.id}`, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reject', exact: true })).toBeEnabled()
  await activate(page.getByRole('button', { name: new RegExp(`Event request ${event.id}`) }))
  await activate(page.getByRole('button', { name: 'Reject', exact: true }))
  await expect(page.getByRole('alert')).toContainText('A reason is required')
  await page.getByLabel('Decision note').fill('No technician is available')
  await activate(page.getByRole('button', { name: 'Reject', exact: true }))
  await expect(page.getByRole('status')).toContainText('Technical requirements rejected')
  const support = await session(playwright.request, emails.support)
  try {
    const record = await support.get(`/api/events/${event.id}/technical-request`)
    expect(record.status()).toBe(200)
    expect(await record.json()).toMatchObject({ status: 'REJECTED', decisionReason: 'No technician is available' })
  }
  finally { await support.dispose() }
})

test('CS-40 TC-03/06: Technical Support approves an explicit no-requirements request', async ({ page, playwright, owner }) => {
  const event = await created(owner, 'submit', validRequest())
  const email = await coordinatorFor(owner, event.id)
  const coordinator = await session(playwright.request, email)
  try {
    const submission = await mutation(coordinator, 'POST', `/api/events/${event.id}/technical-request`, {
      ...technicalBody,
      equipment: [], supportRequired: false, supportDetails: '', notRequired: true,
    })
    expect(submission.status()).toBe(200)
  }
  finally { await coordinator.dispose() }

  await signIn(page, emails.support)
  await page.goto('/technical-requests')
  await expect(page.getByText(`Event request ${event.id}`, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeEnabled()
  await activate(page.getByRole('button', { name: new RegExp(`Event request ${event.id}`) }))
  await expect(page.getByText('None requested', { exact: true })).toBeVisible()
  await activate(page.getByRole('button', { name: 'Approve', exact: true }))
  await expect(page.getByRole('status')).toContainText('Technical requirements approved')
})

test('CS-40 TC-07: changing approved requirements returns them to Technical Support review', async ({ page, playwright, owner }) => {
  const event = await created(owner, 'submit', validRequest())
  const email = await coordinatorFor(owner, event.id)
  const coordinator = await session(playwright.request, email)
  try {
    expect((await mutation(coordinator, 'POST', `/api/events/${event.id}/technical-request`, technicalBody)).status()).toBe(200)
  }
  finally { await coordinator.dispose() }

  await signIn(page, emails.support)
  await page.goto('/technical-requests')
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeEnabled()
  await activate(page.getByRole('button', { name: new RegExp(`Event request ${event.id}`) }))
  await activate(page.getByRole('button', { name: 'Approve', exact: true }))
  await expect(page.getByRole('status')).toContainText('Technical requirements approved')

  await signIn(page, email)
  await page.goto(`/technical-requirements/${event.id}`)
  await expect(page.getByTestId('technical-status')).toContainText('Approved')
  await field(page, 'projector quantity').fill('3')
  await activate(page.getByRole('button', { name: 'Update requirements', exact: true }))
  await expect(page.getByTestId('technical-status')).toContainText('Pending Technical Support review')
  const refreshed = await session(playwright.request, email)
  try {
    const record = await refreshed.get(`/api/events/${event.id}/technical-request`)
    expect(await record.json()).toMatchObject({
      version: 2,
      status: 'SUBMITTED',
      equipment: [
        { equipmentType: 'projector', quantity: 3 },
        { equipmentType: 'speaker', quantity: 1 },
      ],
    })
  }
  finally { await refreshed.dispose() }
})

test('CS-40 TC-08/09: Coordinators cannot use the review queue and Technical Support has a read-only request view', async ({ page, playwright, owner }) => {
  const event = await created(owner, 'submit', validRequest())
  const email = await coordinatorFor(owner, event.id)
  const coordinator = await session(playwright.request, email)
  try {
    expect((await mutation(coordinator, 'POST', `/api/events/${event.id}/technical-request`, technicalBody)).status()).toBe(200)
  }
  finally { await coordinator.dispose() }

  await signIn(page, emails.support)
  await page.goto(`/technical-requirements/${event.id}`)
  await expect(page.getByTestId('technical-status')).toContainText('Pending Technical Support review')
  await expect(page.getByText('These requirements are read-only for your account.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Update requirements' })).toHaveCount(0)

  await signIn(page, email)
  await page.goto('/technical-requests')
  await expect(page.getByRole('alert')).toContainText('review queue is unavailable')
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Reject', exact: true })).toHaveCount(0)
})

test('CS-40 TC-11: Technical Support cannot approve a superseded requirements version', async ({ page, playwright, owner }) => {
  const event = await created(owner, 'submit', validRequest())
  const email = await coordinatorFor(owner, event.id)
  const coordinator = await session(playwright.request, email)
  try {
    expect((await mutation(coordinator, 'POST', `/api/events/${event.id}/technical-request`, technicalBody)).status()).toBe(200)
  }
  finally { await coordinator.dispose() }

  await signIn(page, emails.support)
  await page.goto('/technical-requests')
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeEnabled()
  await activate(page.getByRole('button', { name: new RegExp(`Event request ${event.id}`) }))

  const currentCoordinator = await session(playwright.request, email)
  try {
    const update = await mutation(currentCoordinator, 'POST', `/api/events/${event.id}/technical-request`, {
      ...technicalBody,
      equipment: [{ equipmentType: 'projector', quantity: 4 }],
      placementDetails: 'Updated after Support opened the review queue',
    })
    expect(update.status()).toBe(200)
  }
  finally { await currentCoordinator.dispose() }

  await activate(page.getByRole('button', { name: 'Approve', exact: true }))
  await expect(page.getByRole('alert')).toBeVisible()
  const support = await session(playwright.request, emails.support)
  try {
    const record = await support.get(`/api/events/${event.id}/technical-request`)
    expect(await record.json()).toMatchObject({ version: 2, status: 'SUBMITTED', equipment: [{ equipmentType: 'projector', quantity: 4 }] })
  }
  finally { await support.dispose() }
})
