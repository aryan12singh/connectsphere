<script setup lang="ts">
import { computed } from 'vue'
import { CalendarDaysIcon, MapPinIcon, UsersRoundIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

useHead({ title: 'Your events | ConnectSphere' })

const { data: events, error } = await useFetch<{ events: Array<{
  id: string, eventId: string, title: string, description: string,
  status: string, startAt: string, endAt: string, timeZone: string,
  primaryVenueId: string | null, primaryVenueName: string | null,
  registrationLimit: number | null, confirmedRegistrationCount: number, placesRemaining: number | null,
  registrationWindow: { startAt: string, endAt: string } | null,
  organiserId: string | null, createdAt: string, updatedAt: string
}> }>('/api/attendances/events')

const eventList = computed(() => events.value?.events ?? [])

function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value))
}

function formatDateTimeRange(startAt: string, endAt: string, timeZone: string) {
  return `${formatDate(startAt, timeZone)} – ${formatDate(endAt, timeZone)}`
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

function changeAttendanceView(value: string | number) {
  if (value === 'registrations') void navigateTo('/attendances/registrations')
}
</script>

<template>
  <main class="mx-auto w-full max-w-6xl px-5 py-10 md:px-8 md:py-14">
    <header>
      <div class="max-w-2xl space-y-2">
        <h1 class="text-3xl font-semibold tracking-tight md:text-4xl">Your events</h1>
        <p class="text-base leading-7 text-muted-foreground">Track your confirmed events and view confirmed arrangements.</p>
      </div>
      <Tabs :model-value="'events'" class="mt-6" @update:model-value="changeAttendanceView">
        <TabsList variant="line" aria-label="Attendance views" class="h-auto! w-full flex-wrap justify-start gap-x-5 gap-y-3 sm:w-fit">
          <TabsTrigger value="events" class="flex-none">Confirmed events</TabsTrigger>
          <TabsTrigger value="registrations" class="flex-none">My registrations</TabsTrigger>
        </TabsList>
      </Tabs>
    </header>

    <p v-if="error" role="alert" class="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      Unable to load events. Please try again later.
    </p>

    <Card v-else-if="eventList.length === 0" class="mt-10 max-w-2xl" aria-labelledby="empty-events-heading">
      <CardHeader>
        <CardTitle id="empty-events-heading">No events yet</CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-sm leading-6 text-muted-foreground">There are no confirmed events available for you right now.</p>
        <Button as-child variant="outline" class="mt-5">
          <NuxtLink to="/">Back home</NuxtLink>
        </Button>
      </CardContent>
    </Card>

    <section v-else class="mt-8" aria-label="Confirmed events">
      <div class="grid gap-4">
        <article
          v-for="event in eventList"
          :key="event.id"
          :aria-label="event.title"
          class="min-w-0"
        >
          <NuxtLink :to="`/attendances/events/${event.eventId}`" class="group block rounded-[18px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <Card class="h-full min-w-0 gap-0 rounded-[18px] border border-border !bg-transparent p-0 !shadow-none !ring-0 transition-colors duration-150 group-hover:!bg-muted/20 group-focus-visible:!bg-muted/20 group-active:!bg-muted/35">
              <CardHeader class="flex min-w-0 flex-row items-start justify-between gap-4 px-5 pb-0 pt-5 md:px-6 md:pt-6">
                <div class="min-w-0">
                  <h3 class="text-lg font-medium leading-6 tracking-tight">{{ event.title }}</h3>
                  <p class="mt-1 text-sm text-muted-foreground">Event {{ event.eventId }}</p>
                </div>
                <Badge :class="statusBadge(event.status)" class="shrink-0">{{ formatStatus(event.status) }}</Badge>
              </CardHeader>

              <CardContent class="px-5 pb-5 pt-5 md:px-6 md:pb-6">
                <dl class="grid gap-x-8 gap-y-6 text-sm sm:grid-cols-3">
                  <div class="min-w-0 space-y-1.5">
                    <dt class="flex items-center gap-2 font-medium text-muted-foreground"><CalendarDaysIcon :size="16" aria-hidden="true" />Date &amp; time</dt>
                    <dd class="font-medium leading-5"><time>{{ formatDateTimeRange(event.startAt, event.endAt, event.timeZone) }}</time></dd>
                    <dd class="text-sm text-muted-foreground">{{ event.timeZone }}</dd>
                  </div>
                  <div class="min-w-0 space-y-1.5">
                    <dt class="flex items-center gap-2 font-medium text-muted-foreground"><MapPinIcon :size="16" aria-hidden="true" />Primary location</dt>
                    <dd class="truncate font-medium leading-5">{{ event.primaryVenueName || 'TBD' }}</dd>
                    <dd class="text-sm text-muted-foreground">Primary venue</dd>
                  </div>
                  <div class="min-w-0 space-y-1.5">
                    <dt class="flex items-center gap-2 font-medium text-muted-foreground"><UsersRoundIcon :size="16" aria-hidden="true" />Registration limit</dt>
                    <dd class="font-medium">{{ event.registrationLimit == null ? 'Not set' : `${event.registrationLimit} ${event.registrationLimit === 1 ? 'attendee' : 'attendees'}` }}</dd>
                    <dd class="text-sm text-muted-foreground">{{ event.placesRemaining == null ? 'Limit not set' : `${event.placesRemaining} ${event.placesRemaining === 1 ? 'place' : 'places'} left` }}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </NuxtLink>
        </article>
      </div>
    </section>
  </main>
</template>
