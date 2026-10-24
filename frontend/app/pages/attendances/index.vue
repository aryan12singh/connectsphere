<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { useUserSession } from '#imports'

const { user } = useUserSession()
useHead({ title: 'Your events | ConnectSphere' })

const { data: events, error, refresh } = await useFetch<{ events: Array<{
  id: string, eventId: string, title: string, description: string,
  status: string, startAt: string, endAt: string, timeZone: string,
  primaryVenueId: string | null, primaryVenueName: string | null,
  registrationLimit: number | null, confirmedRegistrationCount: number, placesRemaining: number | null,
  registrationWindow: { startAt: string, endAt: string } | null,
  organiserId: string | null, createdAt: string, updatedAt: string
}> }>('/api/attendances/events')

const eventList = computed(() => events.value?.events ?? [])
const loading = ref(!events.value && !error.value)

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function statusBadge(status: string) {
  if (status === 'CONFIRMED') return 'bg-success-soft text-success'
  if (status === 'CANCELLED') return 'bg-destructive/10 text-destructive'
  return 'bg-warning-soft text-warning'
}
</script>

<template>
  <main class="mx-auto w-full max-w-5xl px-5 py-8 md:px-8">
    <div class="flex flex-col gap-2">
      <h1 class="text-3xl font-semibold">Your events</h1>
      <p class="text-sm text-muted-foreground">Track your confirmed events and view confirmed arrangements.</p>
      <NuxtLink to="/attendances/registrations" class="w-fit text-sm underline text-primary">My registrations</NuxtLink>
    </div>

    <p v-if="error" role="alert" class="mt-4 text-destructive">Unable to load events. Please try again later.</p>

    <Separator v-if="loading || (!error && eventList.length === 0)" class="mt-6" />

    <Card v-if="eventList.length === 0 && !error" class="mt-6">
      <CardHeader>
        <CardTitle>No events yet</CardTitle>
      </CardHeader>
      <CardContent class="flex flex-col items-center gap-3 py-8">
        <p class="text-sm text-muted-foreground">There are no confirmed events available for you right now.</p>
        <Button as-child variant="outline">
          <NuxtLink to="/">Back home</NuxtLink>
        </Button>
      </CardContent>
    </Card>

    <Card v-if="eventList.length > 0" class="mt-6">
      <CardHeader>
        <CardTitle>Confirmed events</CardTitle>
        <CardDescription>Events you can attend</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="overflow-x-auto rounded-lg border">
          <Table class="w-full text-sm">
            <TableHeader>
              <TableRow class="bg-muted">
                <TableHead scope="col" class="px-4 py-3">Event</TableHead>
                <TableHead scope="col" class="px-4 py-3">Date &amp; time</TableHead>
                <TableHead scope="col" class="px-4 py-3">Primary location</TableHead>
                <TableHead scope="col" class="px-4 py-3">Registration limit</TableHead>
                <TableHead scope="col" class="px-4 py-3">Places left</TableHead>
                <TableHead scope="col" class="px-4 py-3">Status</TableHead>
                <TableHead scope="col" class="px-4 py-3"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="event in eventList" :key="event.id" class="border-b">
                <TableCell class="px-4 py-3">
                  <div class="font-medium">{{ event.title }}</div>
                  <p class="text-xs text-muted-foreground">Event {{ event.eventId }}</p>
                </TableCell>
                <TableCell class="px-4 py-3">
                  <time>{{ formatDate(event.startAt) }}</time>
                  <p class="text-xs text-muted-foreground">{{ event.timeZone }}</p>
                </TableCell>
                <TableCell class="px-4 py-3">
                  <div class="font-medium">{{ event.primaryVenueName || 'TBD' }}</div>
                  <span class="text-xs text-muted-foreground">Primary venue</span>
                </TableCell>
                <TableCell class="px-4 py-3">
                  <div v-if="event.registrationLimit != null">{{ event.registrationLimit }} {{ event.registrationLimit === 1 ? 'attendee' : 'attendees' }}</div>
                  <div v-else>Not set</div>
                </TableCell>
                <TableCell class="px-4 py-3">
                  <div v-if="event.placesRemaining != null">{{ event.placesRemaining }} {{ event.placesRemaining === 1 ? 'place' : 'places' }} left</div>
                  <div v-else>Limit not set</div>
                </TableCell>
                <TableCell class="px-4 py-3">
                  <Badge :class="statusBadge(event.status)">{{ event.status }}</Badge>
                </TableCell>
                <TableCell class="px-4 py-3">
                  <NuxtLink :to="`/attendances/events/${event.eventId}`" class="underline text-sm text-primary">Event {{ event.eventId }}</NuxtLink>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  </main>
</template>
