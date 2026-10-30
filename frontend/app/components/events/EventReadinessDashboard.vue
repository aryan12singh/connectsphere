<script setup lang="ts">
import { computed } from 'vue'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { canOpenRegistrationPage as canOpenRegistrationForUser } from '~~/lib/attendance-state'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import RequestActivityHistory from './RequestActivityHistory.vue'
import { EVENT_STATUS_LABELS } from './status-labels'

interface Booking {
  id: string
  venueName?: string
  venueId: string
  status: string
  effectiveStatus?: string
}

interface EventSummary {
  event: {
    id: string
    title: string
    status: string
    startAt: string
    endAt: string
    timeZone: string
    expectedAttendance: number
  }
  items: Booking[]
  venueReady: boolean
  primaryVenue?: { bookingId: string | null; available: boolean }
  outstanding: Array<{ bookingId: string | null; venueName?: string; reasons: string[] }>
}

interface SafetyView {
  event?: { status: string }
  state: string
  canSubmit: boolean
  venueReady?: boolean
  technical?: { status: string; reason?: string }
  nextAction?: string
}

const props = defineProps<{ eventId: string, statusOverride?: string | null }>()
const { user } = useUserSession()

const { data: summary, error: summaryError, refresh: refreshSummary } = await useFetch<EventSummary>(
  () => `/api/bookings/events/${encodeURIComponent(props.eventId)}/summary`,
  { watch: [() => props.eventId] },
)
const { data: safety, error: safetyError, refresh: refreshSafety } = await useFetch<SafetyView>(
  () => `/api/safety/events/${encodeURIComponent(props.eventId)}`,
  { watch: [() => props.eventId] },
)

const event = computed(() => summary.value?.event)
const currentEventStatus = computed(() => props.statusOverride ?? safety.value?.event?.status ?? event.value?.status)
const eventStatus = computed(() => statusLabel(currentEventStatus.value))
const canOpenRegistrationPage = computed(() => canOpenRegistrationForUser(user.value, currentEventStatus.value))
const primaryVenue = computed(() => {
  const bookingId = summary.value?.primaryVenue?.bookingId
  if (!bookingId)
    return 'Not selected'
  const room = summary.value?.items.find(item => item.id === bookingId)
  return room?.venueName || room?.venueId || 'Unavailable'
})
const approvedBookings = computed(() => summary.value?.items.filter(item => (item.effectiveStatus || item.status) === 'CONFIRMED').length ?? 0)
const venueSummary = computed(() => {
  if (!summary.value)
    return 'Unavailable'
  if (summary.value.venueReady)
    return `${approvedBookings.value} approved booking${approvedBookings.value === 1 ? '' : 's'}`
  const first = summary.value.outstanding[0]
  return first ? `${first.venueName || 'Venue arrangement'} needs attention` : 'Needs attention'
})
const technicalStatus = computed(() => safety.value?.technical ? statusLabel(safety.value.technical.status) : 'Unavailable')
const safetyStatus = computed(() => safety.value ? statusLabel(safety.value.state) : 'Unavailable')
const activeStage = computed(() => {
  const status = currentEventStatus.value
  if (!status || ['CANCELLING', 'CANCELLED', 'COMPLETED', 'REJECTED'].includes(status))
    return -1
  if (status === 'PREPARATION')
    return 4
  if (status === 'CONFIRMED')
    return 3
  if (safety.value?.state === 'APPROVED')
    return 2
  if (['PENDING', 'CHANGES_REQUIRED', 'STALE'].includes(safety.value?.state || ''))
    return 1
  return 0
})
const stages = ['Planning', 'Safety review', 'Safety approved', 'Confirmed', 'Preparation']

function statusLabel(value?: string) {
  if (!value)
    return 'Unavailable'
  if (EVENT_STATUS_LABELS[value])
    return EVENT_STATUS_LABELS[value]
  return {
    NOT_REQUIRED: 'Not required',
    CHANGES_REQUIRED: 'Changes required',
  }[value] || value.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, match => match.toUpperCase())
}

function dateTime(value: string | undefined, timeZone: string | undefined) {
  if (!value)
    return 'Unavailable'
  return new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timeZone || 'UTC',
  }).format(new Date(value))
}

function eventTime() {
  if (!event.value)
    return 'Unavailable'
  return `${dateTime(event.value.startAt, event.value.timeZone)} – ${dateTime(event.value.endAt, event.value.timeZone)}`
}

async function refresh() {
  await Promise.all([refreshSummary(), refreshSafety()])
}

defineExpose({ refresh })
</script>

<template>
  <section aria-label="Event readiness overview" class="grid gap-6">
    <header class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
      <div>
        <p class="text-sm text-muted-foreground">Event readiness</p>
        <h1 class="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
          {{ event?.title || 'Event details' }}
        </h1>
        <p class="mt-2 text-sm text-muted-foreground md:text-base">
          {{ eventTime() }}<span v-if="event"> · {{ event.expectedAttendance }} attendees · {{ event.timeZone }}</span>
        </p>
        <p class="mt-2 break-all text-sm text-muted-foreground">Event ID: {{ props.eventId }}</p>
      </div>
      <Button v-if="canOpenRegistrationPage" as-child variant="outline" size="sm" aria-label="Go to registration page">
        <NuxtLink :to="`/attendances/events/${encodeURIComponent(props.eventId)}`">Go to registration page</NuxtLink>
      </Button>
      <Badge v-else variant="outline" class="border-transparent bg-muted px-3 py-1 text-sm font-medium text-foreground">
        {{ eventStatus }}
      </Badge>
    </header>

    <Alert v-if="summaryError && safetyError" variant="destructive">
      <p class="col-start-2">Event readiness is unavailable. Refresh the page before taking action.</p>
    </Alert>

    <ol aria-label="Event lifecycle" class="flex gap-2 overflow-x-auto pb-1">
      <li v-for="(stage, index) in stages" :key="stage" class="flex shrink-0 items-center gap-2">
        <span
          :aria-current="index === activeStage ? 'step' : undefined"
          :class="[
            'rounded-full border px-3 py-1.5 text-sm whitespace-nowrap',
            index < activeStage ? 'border-transparent bg-success-soft text-success' : '',
            index === activeStage ? 'border-primary bg-primary text-primary-foreground' : '',
            index > activeStage || activeStage < 0 ? 'border-transparent bg-muted text-muted-foreground' : '',
          ]"
        >
          {{ stage }}
        </span>
        <Separator v-if="index < stages.length - 1" class="w-5" />
      </li>
    </ol>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(19rem,0.85fr)]">
      <Card class="gap-0 rounded-[18px] border border-border !bg-transparent py-0 !shadow-none !ring-0">
        <CardHeader class="border-b border-border px-5 py-5 md:px-6">
          <CardTitle class="text-xl font-semibold tracking-tight">Arrangements checklist</CardTitle>
          <CardDescription>Current readiness across the available Event arrangements.</CardDescription>
        </CardHeader>
        <CardContent class="grid gap-0 px-5 py-2 md:px-6">
          <dl class="divide-y divide-border">
            <div class="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div>
                <dt class="font-medium">Venue arrangements</dt>
                <dd class="mt-1 text-sm text-muted-foreground">{{ venueSummary }}</dd>
              </div>
              <Badge variant="outline" class="border-transparent bg-muted font-normal text-muted-foreground">{{ summary?.venueReady ? 'Ready' : summary ? 'Needs attention' : 'Unavailable' }}</Badge>
            </div>
            <div class="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div>
                <dt class="font-medium">Technical and support</dt>
                <dd class="mt-1 text-sm text-muted-foreground">{{ safety?.technical?.reason || 'Current technical/support readiness.' }}</dd>
              </div>
              <Badge variant="outline" class="border-transparent bg-muted font-normal text-muted-foreground">{{ technicalStatus }}</Badge>
            </div>
            <div class="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div>
                <dt class="font-medium">Safety review</dt>
                <dd class="mt-1 text-sm text-muted-foreground">{{ safety?.nextAction || 'No further action is recorded.' }}</dd>
              </div>
              <Badge variant="outline" class="border-transparent bg-muted font-normal text-muted-foreground">{{ safetyStatus }}</Badge>
            </div>
            <div class="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div>
                <dt class="font-medium">Primary attendee location</dt>
                <dd class="mt-1 text-sm text-muted-foreground">{{ primaryVenue }}</dd>
              </div>
              <Badge variant="outline" class="border-transparent bg-muted font-normal text-muted-foreground">{{ summary?.primaryVenue?.available ? 'Available' : 'Unconfirmed' }}</Badge>
            </div>
          </dl>
        </CardContent>
      </Card>

      <RequestActivityHistory request-id="" :event-id="props.eventId" />
    </div>
  </section>
</template>
