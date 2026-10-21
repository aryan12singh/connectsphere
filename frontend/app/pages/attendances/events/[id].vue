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
  primaryVenueId: string | null, primaryVenueName: string | null,
  registrationLimit: number | null, registrationWindow: { startAt: string, endAt: string } | null,
  organiserId: string | null, createdAt: string, updatedAt: string
}>(`/api/attendances/events/${encodeURIComponent(eventId)}`)

const loading = ref(!event.value && !error.value)

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
  <main class="mx-auto w-full max-w-4xl px-5 py-8 md:px-8">
    <NuxtLink to="/attendee" class="inline-block mb-4 underline text-sm text-muted-foreground">← Back to your events</NuxtLink>

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
          <p class="text-sm">{{ event.registrationLimit }} attendees</p>
          <p class="text-xs text-muted-foreground">Coordinator-set registration limit</p>
        </div>
        <div v-if="event.registrationWindow" class="flex flex-col gap-3">
          <p class="text-sm font-medium">Registration window</p>
          <p class="text-sm">{{ formatDate(event.registrationWindow.startAt) }} – {{ formatDate(event.registrationWindow.endAt) }}</p>
          <p class="text-xs text-muted-foreground">Registration is not yet available through this page (CS-48)</p>
        </div>
      </CardContent>
      <CardFooter class="flex justify-between">
        <Button as-child variant="outline" disabled>
          Register (coming soon – CS-48)
        </Button>
        <NuxtLink to="/attendee" class="underline text-sm text-muted-foreground">Back to your events</NuxtLink>
      </CardFooter>
    </Card>
  </main>
</template>
