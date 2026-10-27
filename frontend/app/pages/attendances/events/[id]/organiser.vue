<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeftIcon, CalendarDaysIcon, MapPinIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useUserSession } from '#imports'

const route = useRoute()
const eventId = String(route.params.id ?? '')
const { user } = useUserSession()
useHead({ title: 'Event venues | ConnectSphere' })

const { data: event, error } = await useFetch<{
  id: string, eventId: string, title: string, description: string,
  status: string, startAt: string, endAt: string, timeZone: string,
  primaryVenueId: string | null, primaryVenueName: string | null,
  registrationLimit: number | null, registrationWindow: { startAt: string, endAt: string } | null,
  organiserId: string | null, venues: Array<{ id: string, name: string, startAt: string, endAt: string }>,
  createdAt: string, updatedAt: string
}>(`/api/attendances/events/${encodeURIComponent(eventId)}/organiser`)

const isOrganiser = computed(() => user.value?.role === 'EVENT_ORGANISER')

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short', timeZone: event.value?.timeZone || 'Asia/Singapore' }).format(new Date(value))
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
  <main class="mx-auto w-full max-w-4xl px-5 py-8 md:px-8 md:py-12">
    <NuxtLink to="/attendances" class="inline-flex items-center gap-2 rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      <ArrowLeftIcon :size="16" aria-hidden="true" />Back to your events
    </NuxtLink>

    <Card v-if="error || !isOrganiser" class="mt-8 max-w-2xl" aria-labelledby="venue-access-heading">
      <CardHeader>
        <CardTitle id="venue-access-heading" class="text-2xl">Access denied</CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-sm leading-6 text-muted-foreground">{{ error ? 'This event is not available.' : 'Only organisers can view all venue arrangements.' }}</p>
      </CardContent>
    </Card>

    <template v-else-if="event">
      <header class="mt-7">
        <div class="flex flex-wrap items-center gap-2">
          <Badge :class="statusBadge(event.status)">{{ formatStatus(event.status) }}</Badge>
          <span class="text-sm text-muted-foreground">Event {{ event.eventId }}</span>
        </div>
        <h1 class="mt-4 text-3xl font-medium tracking-tight md:text-4xl">All venue arrangements</h1>
        <p class="mt-2 text-base leading-7 text-muted-foreground">{{ event.title }}</p>
      </header>

      <section class="mt-8" aria-labelledby="venue-arrangement-heading">
        <h2 id="venue-arrangement-heading" class="text-xl font-medium">Effective venues</h2>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">As the organiser, you can see all effective venues and their times for this event.</p>

        <ul class="mt-5 grid gap-3 md:grid-cols-2">
          <li v-for="venue in event.venues" :key="venue.id" :aria-label="venue.name">
            <Card class="h-full gap-0 rounded-[18px] border border-border !bg-transparent p-0 !shadow-none !ring-0">
              <CardHeader class="flex flex-row items-start justify-between gap-3 px-5 pb-0 pt-5">
                <CardTitle class="flex min-w-0 items-center gap-2 text-base font-medium leading-6"><MapPinIcon :size="18" class="shrink-0" aria-hidden="true" /><span class="truncate">{{ venue.name }}</span></CardTitle>
                <Badge :class="event.primaryVenueId === venue.id ? 'bg-success-soft text-success' : 'bg-muted/50 text-muted'" class="shrink-0">
                  {{ event.primaryVenueId === venue.id ? 'Primary' : 'Venue' }}
                </Badge>
              </CardHeader>
              <CardContent class="px-5 pb-5 pt-4">
                <p class="flex items-start gap-2 text-sm leading-6 text-muted-foreground"><CalendarDaysIcon :size="16" class="mt-0.5 shrink-0" aria-hidden="true" /><time>{{ formatDate(venue.startAt) }} – {{ formatDate(venue.endAt) }}</time></p>
                <p class="mt-1 text-sm text-muted-foreground">{{ event.timeZone }}</p>
              </CardContent>
            </Card>
          </li>
        </ul>
      </section>

      <nav class="mt-8 flex flex-wrap gap-2" aria-label="Venue actions">
        <Button as-child variant="outline" size="sm"><NuxtLink :to="`/attendances/events/${event.eventId}`">Attendee view</NuxtLink></Button>
        <Button as-child variant="ghost" size="sm" class="!text-muted-foreground hover:!text-foreground"><NuxtLink to="/attendances">Back to your events</NuxtLink></Button>
      </nav>
    </template>
  </main>
</template>
