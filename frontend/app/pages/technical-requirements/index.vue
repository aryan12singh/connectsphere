<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel, FieldSet, FieldLegend } from '@/components/ui/field'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import RequestQueue from '@/components/technical-requirements/RequestQueue.vue'

type RequestItem = {
  eventRequestId: string
  coordinatorId: string
  version: number
  status: string
  reserved: boolean
  decisionReason?: string | null
  equipment: { equipmentType: string, quantity: number, venueId?: string | null, venueName?: string | null }[]
  supportRequired: boolean
  supportDetails: string
  placementDetails: string
  notRequired: boolean
  equipmentPeriod: { startAt: string, endAt: string } | null
  event: { title: string, startAt: string, endAt: string, timeZone: string, submitter: { name: string } } | null
}
type InventoryItem = { equipmentType: string, total: number, version: number }
type Availability = { requestVersion: number, period: { startAt: string, endAt: string }, checkedAt: string, fulfillable: boolean, lines: { equipmentType: string, requested: number, available: number, shortfall: number }[] }

const { data, error, refresh } = await useFetch<{ requests: RequestItem[] }>('/api/technical-requests?includeResolved=1')
const { data: inventoryData } = await useFetch<{ items: InventoryItem[] }>('/api/equipment/inventory')
const requests = computed(() => data.value?.requests ?? [])
const selectedId = ref('')
const selected = computed(() => requests.value.find(request => request.eventRequestId === selectedId.value) ?? requests.value[0] ?? null)
const canDecide = computed(() => selected.value !== null && ['PENDING_TECH_REVIEW', 'SUBMITTED'].includes(selected.value.status))
const decisionReadOnly = computed(() => selected.value !== null && ['APPROVED', 'REJECTED'].includes(selected.value.status))
const reason = ref('')
const decision = ref<'APPROVED' | 'REJECTED'>('APPROVED')
const decisionReason = computed({
  get: () => decisionReadOnly.value ? selected.value?.decisionReason ?? '' : reason.value,
  set: (value: string) => { reason.value = value },
})
const requestReserved = computed(() => selected.value?.reserved === true)
const actionError = ref('')
const saving = ref(false)
const actionResult = ref('')
const refreshWarning = ref('')
const pageReady = ref(false)
const availability = ref<Availability | null>(null)
const availabilityError = ref('')
const checking = ref(false)
let availabilitySequence = 0
const operationType = ref('projector')
const operationQuantity = ref<string | number>(1)
const operationReason = ref('Repair')
const operationStart = ref('')
const operationEnd = ref('')
const decisionSelection = computed<'APPROVED' | 'REJECTED'>({
  get: () => selected.value?.status === 'REJECTED' ? 'REJECTED' : selected.value?.status === 'APPROVED' ? 'APPROVED' : decision.value,
  set: value => { decision.value = value },
})
watch([() => selected.value?.eventRequestId, pageReady], ([requestId, ready]) => {
  availabilitySequence++
  availability.value = null
  availabilityError.value = ''
  checking.value = false
  actionError.value = ''
  if (selected.value?.equipmentPeriod) {
    operationStart.value = localInput(selected.value.equipmentPeriod.startAt, selected.value.event?.timeZone)
    operationEnd.value = localInput(selected.value.equipmentPeriod.endAt, selected.value.event?.timeZone)
  }
  if (ready && requestId) void checkAvailability()
}, { immediate: true })
onMounted(() => { pageReady.value = true })

async function checkAvailability() {
  if (!selected.value) return
  const requestId = selected.value.eventRequestId
  const sequence = ++availabilitySequence
  availability.value = null
  checking.value = true
  availabilityError.value = ''
  try {
    const result = await $fetch<Availability>(`/api/equipment/requests/${encodeURIComponent(requestId)}/availability`)
    if (sequence !== availabilitySequence || selected.value?.eventRequestId !== requestId) return
    availability.value = result
    operationStart.value = localInput(result.period.startAt, selected.value.event?.timeZone)
    operationEnd.value = localInput(result.period.endAt, selected.value.event?.timeZone)
  } catch (error) {
    if (sequence === availabilitySequence && selected.value?.eventRequestId === requestId) availabilityError.value = error instanceof Error ? error.message : 'Unable to check equipment availability.'
  } finally {
    if (sequence === availabilitySequence) checking.value = false
  }
}

function zonedParts(value: Date, timeZone?: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(value)
  return Object.fromEntries(parts.map(part => [part.type, part.value]))
}
function localInput(value: string, timeZone?: string) {
  const parts = zonedParts(new Date(value), timeZone)
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}
function zonedInputToIso(value: string, timeZone?: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) throw new Error('Enter a valid start and end time.')
  const target = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]))
  let instant = target
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = zonedParts(new Date(instant), timeZone)
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))
    instant += target - represented
  }
  return new Date(instant).toISOString()
}
function displayPeriod(startAt?: string, endAt?: string, timeZone?: string) {
  if (!startAt || !endAt) return 'Not available'
  const format = (value: string) => new Intl.DateTimeFormat('en-SG', { timeZone: timeZone || 'UTC', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  return `${format(startAt)} – ${format(endAt)}`
}
function displayTimestamp(value: string, timeZone?: string) {
  return new Intl.DateTimeFormat('en-SG', { timeZone: timeZone || 'UTC', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function statusLabel(status: string) {
  if (status === 'APPROVED') return 'Approved'
  if (status === 'REJECTED') return 'Rejected'
  return 'Under review'
}

function statusClass(status: string) {
  if (status === 'APPROVED') return 'border-transparent bg-success-soft text-success'
  if (status === 'REJECTED') return 'border-transparent bg-destructive/10 text-destructive'
  return 'border-transparent bg-warning-soft text-warning'
}

function equipmentLabel(value: string) {
  const words = value.replace(/[-_]+/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

async function markUnavailable() {
  if (saving.value) return
  saving.value = true
  actionError.value = ''
  actionResult.value = ''
  try {
    await useRequestFetch()('/api/equipment/operations', {
      method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: { equipmentType: operationType.value, quantity: Number(operationQuantity.value), reason: operationReason.value, startAt: zonedInputToIso(operationStart.value, selected.value?.event?.timeZone), endAt: zonedInputToIso(operationEnd.value, selected.value?.event?.timeZone) },
    })
    actionResult.value = 'Operational unavailability recorded.'
    operationReason.value = ''
    await checkAvailability()
  } catch (error) { actionError.value = error instanceof Error ? error.message : 'Unable to record operational unavailability.' }
  finally { saving.value = false }
}

async function decide(decision: 'APPROVED' | 'REJECTED') {
  if (!selected.value || saving.value) return
  const note = reason.value.trim()
  if (decision === 'REJECTED' && !note) {
    actionError.value = 'A reason is required to reject this request.'
    return
  }
  saving.value = true
  actionError.value = ''
  actionResult.value = ''
  try {
    await useRequestFetch()<RequestItem>(`/api/events/${encodeURIComponent(selected.value.eventRequestId)}/technical-request/decision`, {
      method: 'POST',
      body: { decision, reason: note, version: selected.value.version },
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    })
    actionResult.value = decision === 'APPROVED' ? 'Technical requirements approved.' : 'Technical requirements rejected.'
    reason.value = ''
    await refresh()
  }
  catch (error) {
    actionError.value = error instanceof Error ? error.message : 'Unable to save the decision. Please retry.'
  }
  finally { saving.value = false }
}

async function reserve() {
  if (!selected.value || saving.value) return
  const target = { eventRequestId: selected.value.eventRequestId, version: selected.value.version }
  saving.value = true
  actionError.value = ''
  actionResult.value = ''
  refreshWarning.value = ''
  try {
    await useRequestFetch()(`/api/equipment/requests/${encodeURIComponent(target.eventRequestId)}/reserve`, { method: 'POST', body: { version: target.version }, headers: { 'Idempotency-Key': crypto.randomUUID() } })
    // The write is confirmed. Queue enrichment must not delay or erase it.
    if (data.value) data.value = { ...data.value, requests: data.value.requests.map(request => request.eventRequestId === target.eventRequestId && request.version === target.version ? { ...request, reserved: true } : request) }
    if (selected.value?.eventRequestId === target.eventRequestId && selected.value.version === target.version) actionResult.value = 'Complete current equipment reservation saved.'
    const confirmedQueue = data.value
    try {
      await refresh()
      if (error.value) throw error.value
    }
    catch {
      if (!data.value?.requests.length) data.value = confirmedQueue
      error.value = undefined
      refreshWarning.value = 'Equipment reservation saved. Reload to refresh the request list.'
    }
    if (selected.value?.eventRequestId !== target.eventRequestId || selected.value.version !== target.version) actionResult.value = ''
  } catch (error) { actionError.value = error instanceof Error ? error.message : 'Unable to reserve all requested equipment.' }
  finally { saving.value = false }
}

useHead({ title: 'Manage technical availability | ConnectSphere' })
</script>

<template>
  <main class="mx-auto flex min-h-dvh w-full min-w-0 flex-col gap-6 px-5 py-8 md:px-12 lg:fixed lg:inset-x-0 lg:top-16 lg:h-[calc(100dvh-4rem)] lg:min-h-0 lg:overflow-hidden">
    <h1 class="text-[32px] leading-10 font-semibold tracking-tight">Manage technical availability</h1>
    <p v-if="actionResult" role="status" class="text-sm text-muted-foreground">{{ actionResult }}</p>
    <Alert v-if="refreshWarning"><p class="col-start-2">{{ refreshWarning }}</p></Alert>
    <Alert v-if="error" variant="destructive"><p class="col-start-2">The technical review queue is unavailable.</p></Alert>
    <Tabs v-else default-value="review" class="w-full min-w-0 lg:flex-1 lg:flex-col lg:min-h-0">
      <TabsList aria-label="Technical availability views" class="h-auto w-fit max-w-full self-start flex-wrap justify-start gap-1 rounded-none border-b bg-transparent p-0">
        <TabsTrigger value="review" :disabled="!pageReady" class="h-auto flex-none rounded-none px-3 py-2">Review technical requests</TabsTrigger>
        <TabsTrigger value="stock" :disabled="!pageReady" class="h-auto flex-none rounded-none px-3 py-2">Manage equipment stock</TabsTrigger>
      </TabsList>

      <TabsContent value="review" class="mt-5 w-full min-w-0 lg:flex-1 lg:min-h-0 lg:overflow-hidden">
        <p v-if="requests.length === 0" role="status" class="rounded-xl border bg-card p-6 text-muted-foreground">No technical requests are awaiting review.</p>
        <div v-else class="grid w-full min-w-0 grid-cols-1 items-start gap-6 lg:h-full lg:min-h-0 lg:grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(18rem,22.5rem)_minmax(0,1fr)]">
          <RequestQueue :requests="requests" :selected-id="selected?.eventRequestId || ''" @select="request => { selectedId = request.eventRequestId; reason = ''; actionError = '' }" />

          <section v-if="selected" aria-label="Selected technical request" class="grid w-full min-w-0 max-w-none grid-cols-1 gap-4 lg:h-full lg:min-h-0 lg:auto-rows-max lg:content-start lg:overflow-y-auto lg:px-2 lg:pb-2">
            <Card class="w-full min-w-0 max-w-none gap-0 p-6 md:p-7">
              <div class="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-sm text-muted-foreground">Technical request</p>
                  <h2 class="mt-1 break-words text-xl font-medium">{{ selected.event?.title || `Event request ${selected.eventRequestId}` }}</h2>
                </div>
                <Badge :class="statusClass(selected.status)">{{ statusLabel(selected.status) }}</Badge>
              </div>
              <dl class="mt-2 grid min-w-0 gap-x-8 gap-y-3 sm:grid-cols-2">
                <div class="min-w-0">
                  <dt class="text-xs text-muted-foreground">Version</dt>
                  <dd class="mt-0.5 break-words text-sm">v{{ selected.version }}</dd>
                </div>
                <div class="min-w-0">
                  <dt class="text-xs text-muted-foreground">Submitted by</dt>
                  <dd class="mt-0.5 break-words text-sm">{{ selected.event?.submitter.name || 'Unknown' }}</dd>
                </div>
                <div class="min-w-0">
                  <dt class="text-xs text-muted-foreground">Event period</dt>
                  <dd class="mt-0.5 break-words text-sm">{{ displayPeriod(selected.event?.startAt, selected.event?.endAt, selected.event?.timeZone) }}</dd>
                </div>
                <div class="min-w-0">
                  <dt class="text-xs text-muted-foreground">Equipment period</dt>
                  <dd class="mt-0.5 break-words text-sm">{{ displayPeriod(selected.equipmentPeriod?.startAt, selected.equipmentPeriod?.endAt, selected.event?.timeZone) }}</dd>
                </div>
                <div class="min-w-0 sm:col-span-2">
                  <dt class="text-xs text-muted-foreground">Equipment requested</dt>
                  <dd class="mt-0.5 break-words text-sm">{{ selected.equipment.length ? selected.equipment.map(item => `${equipmentLabel(item.equipmentType)} — ${item.quantity}`).join(', ') : 'None requested' }}</dd>
                </div>
                <div class="min-w-0 sm:col-span-2">
                  <dt class="text-xs text-muted-foreground">Technical support</dt>
                  <dd class="mt-0.5 break-words text-sm">{{ selected.supportRequired ? selected.supportDetails : 'Not required' }}</dd>
                </div>
                <div class="min-w-0 sm:col-span-2">
                  <dt class="text-xs text-muted-foreground">Placement and preparation</dt>
                  <dd class="mt-0.5 break-words text-sm">{{ selected.placementDetails || 'Not provided' }}</dd>
                </div>
              </dl>
            </Card>

            <Card aria-label="Technical request decision and equipment availability" class="w-full min-w-0 max-w-none gap-5 p-6 md:p-7">
              <div class="grid gap-0">
                <h2 class="text-xl font-medium">Decision</h2>
                <div class="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
                  <p class="text-sm text-muted-foreground">
                    Last checked at
                    <time v-if="availability" :datetime="availability.checkedAt">{{ displayTimestamp(availability.checkedAt, selected.event?.timeZone) }}</time>
                    <span v-else-if="checking">Checking…</span>
                    <span v-else>Not checked</span>
                  </p>
                  <Button type="button" variant="outline" :disabled="checking || !pageReady" @click="checkAvailability">{{ checking ? 'Checking…' : availability ? 'Re-check' : 'Check availability' }}</Button>
                </div>
              </div>
              <div class="grid min-w-0 gap-4">
                <Alert v-if="availabilityError" variant="destructive"><p class="col-start-2">{{ availabilityError }}</p></Alert>
                <div v-if="availability" class="min-w-0 overflow-x-auto rounded-lg border">
                  <Table aria-label="Equipment availability" :class="requestReserved ? 'min-w-0' : 'min-w-[40rem]'">
                    <TableHeader>
                      <TableRow class="bg-muted/50">
                        <TableHead scope="col">Equipment</TableHead>
                        <TableHead scope="col">Requested</TableHead>
                        <TableHead v-if="!requestReserved" scope="col">Available</TableHead>
                        <TableHead v-if="!requestReserved" scope="col">Shortfall</TableHead>
                        <TableHead v-if="!requestReserved" scope="col">Result</TableHead>
                        <TableHead scope="col">Venue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow v-for="line in availability.lines" :key="line.equipmentType" :class="!requestReserved && line.shortfall ? 'bg-destructive/10' : ''">
                        <TableHead scope="row" class="font-medium text-foreground">{{ equipmentLabel(line.equipmentType) }}</TableHead>
                        <TableCell>{{ line.requested }}</TableCell>
                        <template v-if="!requestReserved">
                          <TableCell>{{ line.available }}</TableCell>
                          <TableCell>{{ line.shortfall }}</TableCell>
                          <TableCell>
                            <Badge :class="line.shortfall ? 'border-transparent bg-destructive/10 text-destructive' : 'border-transparent bg-success-soft text-success'">
                              {{ line.shortfall ? `Short by ${line.shortfall}` : 'Available' }}
                            </Badge>
                          </TableCell>
                        </template>
                        <TableCell>{{ selected.equipment.find(item => item.equipmentType === line.equipmentType)?.venueName || '—' }}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                <Alert v-if="availability && !requestReserved && !availability.fulfillable" variant="destructive" class="grid gap-1">
                  <div class="col-start-2 grid gap-1">
                    <p class="font-semibold">Not fulfillable</p>
                    <p>{{ availability.lines.filter(line => line.shortfall > 0).map(line => `${equipmentLabel(line.equipmentType)} is short by ${line.shortfall}`).join('; ') }}. The whole request must be available before reserving — nothing is reserved partially.</p>
                  </div>
                </Alert>
              </div>

              <FieldSet :disabled="saving || !pageReady || decisionReadOnly">
                <FieldLegend variant="label">Decision</FieldLegend>
                <RadioGroup v-model="decisionSelection" aria-label="Technical request decision" :disabled="saving || !pageReady || decisionReadOnly" class="flex flex-wrap gap-6">
                  <Field orientation="horizontal" class="w-fit items-center gap-2">
                    <RadioGroupItem id="decision-approve" value="APPROVED" aria-label="Approve" :disabled="saving || !pageReady || decisionReadOnly" />
                    <FieldLabel for="decision-approve">Approve</FieldLabel>
                  </Field>
                  <Field orientation="horizontal" class="w-fit items-center gap-2">
                    <RadioGroupItem id="decision-reject" value="REJECTED" aria-label="Reject" :disabled="saving || !pageReady || decisionReadOnly" />
                    <FieldLabel for="decision-reject">Reject</FieldLabel>
                  </Field>
                </RadioGroup>
              </FieldSet>
              <Field>
                <FieldLabel for="decision-reason">Reason <span aria-hidden="true">*</span></FieldLabel>
                <Textarea id="decision-reason" v-model="decisionReason" aria-label="Decision note" :maxlength="500" :disabled="saving || !pageReady || decisionReadOnly" />
                <p v-if="!decisionReadOnly && decision === 'REJECTED'" class="text-sm text-muted-foreground">Required when rejecting (1–500 characters).</p>
              </Field>
              <Alert v-if="actionError" variant="destructive"><p class="col-start-2">{{ actionError }}</p></Alert>
              <div class="flex flex-wrap justify-end gap-2.5">
                <Button v-if="canDecide" type="button" :disabled="saving || !pageReady" @click="decide(decisionSelection)">Submit decision</Button>
                <Button v-else-if="selected.status === 'APPROVED'" type="button" :disabled="saving || !pageReady || requestReserved" @click="reserve">{{ requestReserved ? 'Reserved' : 'Reserve complete request' }}</Button>
              </div>
            </Card>
          </section>
        </div>
      </TabsContent>

      <TabsContent value="stock" class="mt-5 min-w-0">
        <Card aria-label="Mark stock unavailable">
          <CardHeader>
            <CardTitle><h2 class="text-lg font-medium">Mark stock unavailable</h2></CardTitle>
            <CardDescription>Repairs or faults reduce supply only for the period entered.</CardDescription>
          </CardHeader>
          <form class="grid gap-4" @submit.prevent="markUnavailable">
            <CardContent class="grid gap-4">
              <FieldGroup>
                <Field>
                  <FieldLabel for="operation-type">Equipment <span aria-hidden="true">*</span></FieldLabel>
                  <Select v-model="operationType">
                    <SelectTrigger id="operation-type" aria-label="Equipment"><SelectValue placeholder="Select equipment" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="item in inventoryData?.items" :key="item.equipmentType" :value="item.equipmentType">{{ equipmentLabel(item.equipmentType) }} (stock {{ item.total }})</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel for="operation-quantity">Quantity <span aria-hidden="true">*</span></FieldLabel>
                  <Input id="operation-quantity" v-model="operationQuantity" type="number" min="1" required />
                </Field>
                <div class="grid min-w-0 gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel for="operation-start">From <span aria-hidden="true">*</span></FieldLabel>
                    <Input id="operation-start" :model-value="operationStart" type="datetime-local" required @update:model-value="operationStart = String($event)" />
                  </Field>
                  <Field>
                    <FieldLabel for="operation-end">To <span aria-hidden="true">*</span></FieldLabel>
                    <Input id="operation-end" :model-value="operationEnd" type="datetime-local" required @update:model-value="operationEnd = String($event)" />
                  </Field>
                </div>
                <Field>
                  <FieldLabel for="operation-reason">Reason <span aria-hidden="true">*</span></FieldLabel>
                  <Select v-model="operationReason">
                    <SelectTrigger id="operation-reason" aria-label="Reason"><SelectValue placeholder="Select a reason" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Repair">Repair</SelectItem>
                      <SelectItem value="Fault">Fault</SelectItem>
                      <SelectItem value="Lost">Lost</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
              <Alert v-if="actionError" variant="destructive"><p class="col-start-2">{{ actionError }}</p></Alert>
            </CardContent>
            <CardFooter>
              <Button type="submit" variant="outline" class="w-full" :disabled="saving || !pageReady">Save</Button>
            </CardFooter>
          </form>
        </Card>
      </TabsContent>
    </Tabs>
  </main>
</template>

