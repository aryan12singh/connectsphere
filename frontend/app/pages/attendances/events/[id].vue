<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { useUserSession } from '#imports'

const route = useRoute()
const eventId = String(route.params.id ?? '')
const { user } = useUserSession()
useHead({ title: 'Event details | ConnectSphere' })

const { data: event, error, refresh } = await useFetch<{
  id: string, eventId: string, title: string, description: string,
  status: string, startAt: string, endAt: string, timeZone: string,
  venues?: Array<{id:string;name:string;startAt:string;endAt:string}>,
  primaryVenueId: string | null, primaryVenueName: string | null,
  registrationLimit: number | null, confirmedRegistrationCount: number, placesRemaining: number | null,
  registrationEnabled: boolean,
  registrationWindow: { startAt: string, endAt: string } | null,
  organiserId: string | null, createdAt: string, updatedAt: string
}>(`/api/attendances/events/${encodeURIComponent(eventId)}`)

const loading = ref(!event.value && !error.value)
const backHref=computed(()=>user.value?.role==='EVENT_ORGANISER'?'/':'/attendances')
const registering = ref(false)
const hydrated = ref(false)
const registerError = ref('')
const registerSuccess = ref('')
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
  registerSuccess.value = ''
  try {
    const result = await $fetch<{ registration: { id: string, status: string }, placesRemaining: number }>('/api/attendances/events/' + encodeURIComponent(eventId) + '/registrations', { method: 'POST', body: {} })
    registration.value = result.registration
    registerSuccess.value = 'You are registered for this event.'
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

function statusBadge(status: string) {
  if (status === 'CONFIRMED') return 'bg-success-soft text-success'
  if (status === 'CANCELLED') return 'bg-destructive/10 text-destructive'
  return 'bg-warning-soft text-warning'
}
</script>

<template>
  <NuxtPage v-if="route.name === 'attendances-events-id-organiser'" />
  <main v-else class="mx-auto w-full max-w-4xl px-5 py-8 md:px-8">
    <NuxtLink :to="backHref" class="inline-block mb-4 underline text-sm text-muted-foreground">← Back to your events</NuxtLink>

    <Card v-if="error" class="mt-6">
      <CardHeader>
        <CardTitle>Event not found</CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-sm">This event is not available. It may not be confirmed yet, or you do not have permission to view it.</p>

      </CardContent>
    </Card>

    <Card v-if="event && !error" class="mt-6">
      <CardHeader>
        <div class="flex flex-col gap-2">
          <CardTitle><h1>{{ event.title }}</h1></CardTitle>
          <p class="text-sm text-muted-foreground">Event {{ event.eventId }}</p>
        </div>
        <Badge :class="statusBadge(event.status)">{{ event.status }}</Badge>
      </CardHeader>
      <CardContent class="grid gap-4 md:grid-cols-2">
        <div class="flex flex-col gap-3">
          <p class="text-sm font-medium">Description</p>
          <p class="text-sm">{{ event.description || 'No description provided.' }}</p>
        </div>
        <div class="flex flex-col gap-3">
          <p class="text-sm font-medium">Date &amp; time</p>
          <p class="text-sm"><time>{{ formatDate(event.startAt) }}</time></p>
          <p class="text-xs text-muted-foreground">{{ event.timeZone }}</p>
        </div>
        <div class="flex flex-col gap-3">
          <p class="text-sm font-medium">Primary location</p>
          <p class="text-sm font-medium">{{ event.primaryVenueName || 'Not assigned' }}</p>
          <p class="text-xs text-muted-foreground">Designated primary venue for this event</p>
        </div>
        <div class="flex flex-col gap-3">
          <p class="text-sm font-medium">Capacity</p>
          <p class="text-sm">{{ event.registrationLimit === null ? 'Not set' : `${event.registrationLimit} ${event.registrationLimit === 1 ? 'attendee' : 'attendees'}` }}</p>
          <p class="text-xs text-muted-foreground">Coordinator-set registration limit</p>
          <p v-if="event.registrationLimit !== null" class="text-sm" data-testid="places-remaining">
            {{ event.placesRemaining }} {{ event.placesRemaining === 1 ? 'place' : 'places' }} left
          </p>
        </div>
        <div v-if="event.registrationWindow" class="flex flex-col gap-3">
          <p class="text-sm font-medium">Registration window</p>
          <p class="text-sm">{{ formatDate(event.registrationWindow.startAt) }} – {{ formatDate(event.registrationWindow.endAt) }}</p>
          <p class="text-xs text-muted-foreground">Registration is available during this window while places remain.</p>
        </div>
        <section v-if="event.venues?.length" aria-label="Confirmed venues" class="md:col-span-2 grid gap-2"><h2 class="font-medium">Confirmed venues</h2><p v-for="venue in event.venues" :key="venue.id+venue.startAt" class="text-sm">{{ venue.name }} · {{ formatDate(venue.startAt) }} – {{ formatDate(venue.endAt) }}</p></section>
      </CardContent>
      <CardFooter class="flex flex-wrap justify-between gap-3">
        <div class="flex flex-col gap-2">
          <Button v-if="canRegister" :disabled="registering || !hydrated" @click="registerForEvent">{{ registering ? 'Registering…' : 'Register' }}</Button>
          <p v-else-if="user?.role === 'ATTENDEE' && !registerSuccess" class="text-sm text-muted-foreground" role="status">{{ registrationAvailability }}</p>
          <p v-if="registerSuccess" role="status" class="text-sm text-success">{{ registerSuccess }}</p>
          <p v-if="registerError" role="alert" class="text-sm text-destructive">{{ registerError }}</p>
        </div>
        <NuxtLink v-if="user?.role === 'ATTENDEE'" to="/attendances/registrations" class="underline text-sm text-primary">My registrations</NuxtLink>
        <NuxtLink v-if="user?.role === 'EVENT_COORDINATOR' || user?.role === 'EVENT_ORGANISER'" :to="`/attendances/registration-management/${event.eventId}`" class="underline text-sm text-primary">Manage registrations</NuxtLink>
        <NuxtLink :to="backHref" class="underline text-sm text-muted-foreground">Back to your events</NuxtLink>
      </CardFooter>
    </Card>
  </main>
</template>
