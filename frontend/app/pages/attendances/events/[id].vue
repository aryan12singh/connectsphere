<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowLeftIcon, CalendarDaysIcon, MapPinIcon, UsersRoundIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useUserSession } from '#imports'

const route = useRoute()
const eventId = String(route.params.id ?? '')
const { user } = useUserSession()
useHead({ title: 'Event details | ConnectSphere' })

const { data: event, error, refresh } = await useFetch<{
  id: string, eventId: string, title: string, description: string,
  status: string, startAt: string, endAt: string, timeZone: string,
  venues?: Array<{ id: string, name: string, startAt: string, endAt: string }>,
  primaryVenueId: string | null, primaryVenueName: string | null,
  registrationLimit: number | null, confirmedRegistrationCount: number, placesRemaining: number | null,
  registrationEnabled: boolean,
  registrationWindow: { startAt: string, endAt: string } | null,
  organiserId: string | null, createdAt: string, updatedAt: string
}>(`/api/attendances/events/${encodeURIComponent(eventId)}`)

const canViewEventRequest = computed(() => ['EVENT_COORDINATOR', 'EVENT_ORGANISER'].includes(user.value?.role ?? ''))
const { data: eventHistory } = await useFetch<{ entity?: { eventRequestId?: string | null } }>(
  `/api/event-history/${encodeURIComponent(eventId)}`,
  { immediate: canViewEventRequest.value },
)
const eventRequestId = computed(() => eventHistory.value?.entity?.eventRequestId ?? null)
const eventRequestHref = computed(() => eventRequestId.value ? `/requests/${encodeURIComponent(eventRequestId.value)}` : null)
const backHref = computed(() => eventRequestHref.value ?? (user.value?.role === 'EVENT_ORGANISER' ? '/' : '/attendances'))
const registering = ref(false)
const hydrated = ref(false)
const registerError = ref('')
const registration = ref<{ id: string, status: string } | null>(null)
onMounted(() => { hydrated.value = true })

if (user.value?.role === 'ATTENDEE') {
  try {
    const result = await $fetch<{ registrations: Array<{ eventId: string, status: string, id: string }> }>('/api/attendances/registrations')
    registration.value = result.registrations.find(row => row.eventId === eventId) ?? null
  }
  catch { /* Registration lookup failures do not hide public Event details. */ }
}

const canRegister = computed(() => {
  const window = event.value?.registrationWindow
  const now = Date.now()
  return user.value?.role === 'ATTENDEE' && event.value?.status === 'CONFIRMED'
    && event.value.registrationEnabled && event.value.registrationLimit !== null
    && event.value.placesRemaining !== null && event.value.placesRemaining > 0 && !registration.value
    && Boolean(window?.startAt && window?.endAt && now >= Date.parse(window.startAt) && now <= Date.parse(window.endAt))
})
const registrationAvailability = computed(() => {
  if (registration.value) return 'You are registered for this event.'
  if (!event.value) return ''
  if (event.value.registrationLimit === null) return 'Registration is unavailable until the Coordinator sets a limit.'
  if (event.value.placesRemaining === 0) return 'Registration is closed because the event is full.'
  if (!event.value.registrationEnabled) return 'Registration is not enabled for this event.'
  const window = event.value.registrationWindow
  if (!window?.startAt || !window?.endAt) return 'Registration is not open for this event.'
  const now = Date.now()
  if (now < Date.parse(window.startAt)) return `Registration opens ${formatDate(window.startAt)}.`
  if (now > Date.parse(window.endAt)) return 'Registration has closed.'
  return 'Registration is open.'
})

async function registerForEvent() {
  if (!canRegister.value || registering.value) return
  registering.value = true
  registerError.value = ''
  try {
    const result = await $fetch<{ registration: { id: string, status: string }, placesRemaining: number }>('/api/attendances/events/' + encodeURIComponent(eventId) + '/registrations', { method: 'POST', body: {} })
    registration.value = result.registration
    await refresh()
  }
  catch (error: any) {
    registerError.value = error?.data?.error?.message || error?.statusMessage || 'Registration could not be completed. Refresh the page and try again.'
    await refresh()
  }
  finally { registering.value = false }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short', timeZone: event.value?.timeZone || 'Asia/Singapore' }).format(new Date(value))
}

function formatDateTimeRange(startAt: string, endAt: string) {
  return `${formatDate(startAt)} – ${formatDate(endAt)}`
}

function statusBadge(status: string) {
  if (status === 'CONFIRMED') return 'bg-success-soft text-success'
  if (status === 'CANCELLED') return 'bg-destructive/10 text-destructive'
  return 'bg-warning-soft text-warning'
}

function formatStatus(status: string) {
  return status
    .toLowerCase()
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
</script>

<template>
  <NuxtPage v-if="route.name === 'attendances-events-id-organiser'" />
  <main v-else class="mx-auto w-full max-w-3xl px-5 py-8 md:px-8 md:py-12">
    <NuxtLink :to="backHref" class="inline-flex items-center gap-2 rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      <ArrowLeftIcon :size="16" aria-hidden="true" />{{ eventRequestHref ? 'Back to event request' : 'Back to your events' }}
    </NuxtLink>

    <Card v-if="error" class="mt-8 max-w-2xl" aria-labelledby="event-unavailable-heading">
      <CardHeader>
        <CardTitle id="event-unavailable-heading" class="text-2xl">Event not found</CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-sm leading-6 text-muted-foreground">This event is not available. It may not be confirmed yet, or you do not have permission to view it.</p>
      </CardContent>
    </Card>

    <template v-else-if="event">
      <header class="mt-7">
        <div class="flex flex-wrap items-center gap-2">
          <Badge :class="statusBadge(event.status)">{{ formatStatus(event.status) }}</Badge>
          <span class="text-sm text-muted-foreground">Event {{ event.eventId }}</span>
        </div>
        <h1 class="mt-4 max-w-3xl text-3xl font-medium leading-tight tracking-tight md:text-5xl">{{ event.title }}</h1>
      </header>

      <section class="mt-8 grid gap-4 sm:grid-cols-2" aria-label="Event essentials">
        <div class="flex min-w-0 items-start gap-3">
          <div class="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground"><CalendarDaysIcon :size="19" aria-hidden="true" /></div>
          <div class="min-w-0 pt-0.5">
            <p class="font-medium leading-6"><time>{{ formatDateTimeRange(event.startAt, event.endAt) }}</time></p>
            <p class="mt-0.5 text-sm text-muted-foreground">{{ event.timeZone }}</p>
          </div>
        </div>
        <div class="flex min-w-0 items-start gap-3">
          <div class="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground"><MapPinIcon :size="19" aria-hidden="true" /></div>
          <div class="min-w-0 pt-0.5">
            <p class="truncate font-medium leading-6">{{ event.primaryVenueName || 'Not assigned' }}</p>
            <p class="mt-0.5 text-sm text-muted-foreground">Primary venue</p>
          </div>
        </div>
      </section>

      <section class="mt-8" aria-label="Registration capacity">
        <Card class="gap-0 rounded-[18px] border border-border !bg-transparent p-0 !shadow-none !ring-0">
          <CardHeader class="px-5 pb-0 pt-5 md:px-6 md:pt-6">
            <CardTitle class="flex items-center gap-2 text-base font-medium leading-6"><UsersRoundIcon :size="18" aria-hidden="true" />Registration</CardTitle>
          </CardHeader>
          <CardContent class="px-5 pb-5 pt-5 md:px-6 md:pb-6">
            <dl class="grid items-start gap-5 sm:grid-cols-2">
              <div v-if="event.registrationWindow" class="grid content-start">
                <dt class="text-sm font-medium text-muted-foreground">Registration window</dt>
                <dd class="mt-1.5 text-lg font-medium leading-7">{{ formatDate(event.registrationWindow.startAt) }} – {{ formatDate(event.registrationWindow.endAt) }}</dd>
                <dd class="mt-1 text-sm leading-6 text-muted-foreground">Registration is available during this window while places remain.</dd>
              </div>
              <div class="grid content-start">
                <dt class="text-sm font-medium text-muted-foreground">Registration limit</dt>
                <dd class="mt-1.5 text-lg font-medium leading-7">{{ event.registrationLimit === null ? 'Not set' : `${event.registrationLimit} ${event.registrationLimit === 1 ? 'attendee' : 'attendees'}` }}</dd>
                <dd v-if="event.registrationLimit !== null" data-testid="places-remaining" class="mt-1 text-sm leading-6 text-muted-foreground">{{ event.placesRemaining }} {{ event.placesRemaining === 1 ? 'place' : 'places' }} left</dd>
                <dd v-else class="mt-1 text-sm leading-6 text-muted-foreground">Coordinator-set registration limit</dd>
              </div>
            </dl>

            <div class="mt-5">
              <p v-if="user?.role === 'ATTENDEE' && registration" role="status" class="mb-3 text-sm font-medium text-success">You are registered for this event.</p>
              <Button v-if="canRegister" :disabled="registering || !hydrated" class="w-full" @click="registerForEvent">{{ registering ? 'Registering…' : 'Register' }}</Button>
              <Button v-else-if="user?.role === 'ATTENDEE' && registration" as-child class="w-full">
                <NuxtLink to="/attendances/registrations" data-testid="registration-primary-action">My registrations</NuxtLink>
              </Button>
              <p v-else-if="user?.role === 'ATTENDEE'" role="status" class="text-sm leading-6 text-muted-foreground">{{ registrationAvailability }}</p>
              <p v-if="registerError" role="alert" class="mt-2 text-sm leading-6 text-destructive">{{ registerError }}</p>
            </div>

            <nav v-if="user?.role === 'EVENT_COORDINATOR' || user?.role === 'EVENT_ORGANISER'" class="mt-5 flex flex-wrap gap-2" aria-label="Event actions">
              <Button v-if="eventRequestHref" as-child variant="outline" size="sm">
                <NuxtLink :to="eventRequestHref">View event request</NuxtLink>
              </Button>
              <Button as-child variant="outline" size="sm">
                <NuxtLink :to="`/attendances/registration-management/${event.eventId}`">Manage registrations</NuxtLink>
              </Button>
            </nav>
          </CardContent>
        </Card>
      </section>

      <section class="mt-10" aria-labelledby="about-event-heading">
        <h2 id="about-event-heading" class="text-xl font-medium">About this event</h2>
        <p class="mt-3 max-w-3xl whitespace-pre-line text-base leading-7">{{ event.description || 'No description provided.' }}</p>
      </section>

      <section v-if="event.venues?.length" class="mt-10" aria-label="Confirmed venues">
        <h2 class="text-xl font-medium">Confirmed venues</h2>
        <ul class="mt-3 grid gap-3">
          <li v-for="venue in event.venues" :key="venue.id + venue.startAt" class="rounded-xl border border-border bg-card px-4 py-3 text-sm">
            <p class="font-medium">{{ venue.name }}</p>
            <p class="mt-1 text-muted-foreground">{{ formatDate(venue.startAt) }} – {{ formatDate(venue.endAt) }}</p>
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>
