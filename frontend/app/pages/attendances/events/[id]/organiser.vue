<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { useUserSession } from '#imports'

const route = useRoute()
const eventId = String(route.params.id ?? '')
const { user } = useUserSession()
useHead({ title: 'Event venues | ConnectSphere' })

const { data: event, error, refresh } = await useFetch<{
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
</script>

<template>
  <main class="mx-auto w-full max-w-5xl px-5 py-8 md:px-8">
    <NuxtLink to="/attendee" class="inline-block mb-4 underline text-sm text-muted-foreground">← Back to your events</NuxtLink>

    <Card v-if="error || !isOrganiser" class="mt-6">
      <CardHeader>
        <CardTitle>Access denied</CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-sm">{{ error ? 'This event is not available.' : 'Only organisers can view all venue arrangements.' }}</p>
      </CardContent>
    </Card>

    <Card v-if="event && !error && isOrganiser" class="mt-6">
      <CardHeader>
        <div class="flex flex-col gap-2">
          <CardTitle>All venue arrangements</CardTitle>
          <p class="text-sm text-muted-foreground">Event {{ event.eventId }} – {{ event.title }}</p>
        </div>
        <Badge :class="statusBadge(event.status)">{{ event.status }}</Badge>
      </CardHeader>
      <CardContent>
        <p class="text-sm text-muted-foreground mb-4">As the organiser, you can see all effective venues and their times for this event.</p>
        <div class="overflow-x-auto rounded-lg border">
          <Table class="w-full text-sm">
            <TableHeader>
              <TableRow class="bg-muted">
                <TableHead scope="col" class="px-4 py-3">Venue</TableHead>
                <TableHead scope="col" class="px-4 py-3">Date &amp; time</TableHead>
                <TableHead scope="col" class="px-4 py-3">Time zone</TableHead>
                <TableHead scope="col" class="px-4 py-3">Primary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="venue in event.venues" :key="venue.id" class="border-b">
                <TableCell class="px-4 py-3 font-medium">{{ venue.name }}</TableCell>
                <TableCell class="px-4 py-3"><time>{{ formatDate(venue.startAt) }} – {{ formatDate(venue.endAt) }}</time></TableCell>
                <TableCell class="px-4 py-3 text-xs text-muted-foreground">{{ event.timeZone }}</TableCell>
                <TableCell class="px-4 py-3">
                  <Badge :class="event.primaryVenueId === venue.id ? 'bg-success-soft text-success' : 'bg-muted/50 text-muted'">
                    {{ event.primaryVenueId === venue.id ? 'Primary' : 'Standard' }}
                  </Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <CardFooter class="flex justify-between">
        <Button as-child variant="outline">
          <NuxtLink to="/attendee">Back to your events</NuxtLink>
        </Button>
        <NuxtLink :to="`/attendances/events/${event.eventId}`" class="underline text-sm text-muted-foreground">Attendee view</NuxtLink>
      </CardFooter>
    </Card>
  </main>
</template>
