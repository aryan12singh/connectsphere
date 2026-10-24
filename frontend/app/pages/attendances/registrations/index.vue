<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

useHead({ title: 'My registrations | ConnectSphere' })
const { data, error } = await useFetch<{ registrations: Array<{
  id: string, eventId: string, status: string, registeredAt: string,
  event?: { title: string, startAt: string, timeZone: string }
}> }>('/api/attendances/registrations')
const registrations = computed(() => data.value?.registrations ?? [])
function formattedDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value))
}
</script>

<template>
  <main class="mx-auto w-full max-w-5xl px-5 py-8 md:px-8">
    <NuxtLink to="/attendances" class="mb-4 inline-block text-sm underline text-muted-foreground">← Back to confirmed events</NuxtLink>
    <h1 class="text-3xl font-semibold">My registrations</h1>
    <p v-if="error" role="alert" class="mt-4 text-destructive">Unable to load your registrations. Please try again later.</p>
    <Card v-else class="mt-6">
      <CardHeader><CardTitle>Events you registered for</CardTitle></CardHeader>
      <CardContent>
        <p v-if="registrations.length === 0" role="status" class="text-sm text-muted-foreground">You do not have any event registrations yet.</p>
        <div v-else class="overflow-x-auto rounded-lg border">
          <Table class="w-full text-sm">
            <TableHeader><TableRow class="bg-muted"><TableHead>Event</TableHead><TableHead>Date &amp; time</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              <TableRow v-for="registration in registrations" :key="registration.id">
                <TableCell><NuxtLink :to="`/attendances/events/${registration.eventId}`" class="font-medium underline">{{ registration.event?.title || registration.eventId }}</NuxtLink></TableCell>
                <TableCell>{{ registration.event ? formattedDate(registration.event.startAt, registration.event.timeZone) : 'Event details unavailable' }}</TableCell>
                <TableCell><Badge class="bg-success-soft text-success">{{ registration.status === 'CONFIRMED' ? 'Registered' : registration.status }}</Badge></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  </main>
</template>
