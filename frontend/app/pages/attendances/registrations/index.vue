<script setup lang="ts">
import { computed } from 'vue'
import { CalendarDaysIcon, MapPinIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

useHead({ title: 'My registrations | ConnectSphere' })
const { data, error } = await useFetch<{ registrations: Array<{
  id: string, eventId: string, status: string, registeredAt: string,
  event?: { eventId: string, title: string, startAt: string, endAt: string, timeZone: string, primaryVenueName: string | null }
}> }>('/api/attendances/registrations')
const registrations = computed(() => data.value?.registrations ?? [])
function formattedDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value))
}

function formattedDateTimeRange(startAt: string, endAt: string, timeZone: string) {
  return `${formattedDate(startAt, timeZone)} – ${formattedDate(endAt, timeZone)}`
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
  if (value === 'events') void navigateTo('/attendances')
}
</script>

<template>
  <main class="mx-auto w-full max-w-6xl px-5 py-10 md:px-8 md:py-14">
    <header>
      <div class="max-w-2xl space-y-2">
        <h1 class="text-3xl font-semibold tracking-tight md:text-4xl">Your events</h1>
        <p class="text-base leading-7 text-muted-foreground">Track your confirmed events and view confirmed arrangements.</p>
      </div>
      <Tabs :model-value="'registrations'" class="mt-6" @update:model-value="changeAttendanceView">
        <TabsList variant="line" aria-label="Attendance views" class="h-auto! w-full flex-wrap justify-start gap-x-5 gap-y-3 sm:w-fit">
          <TabsTrigger value="events" class="flex-none">Confirmed events</TabsTrigger>
          <TabsTrigger value="registrations" class="flex-none">My registrations</TabsTrigger>
        </TabsList>
      </Tabs>
    </header>

    <p v-if="error" role="alert" class="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">Unable to load your registrations. Please try again later.</p>
    <section v-else class="mt-8" aria-label="Registered events">
      <Card v-if="registrations.length === 0" class="max-w-2xl rounded-[18px] border border-border !bg-transparent !shadow-none !ring-0">
        <CardContent class="py-5">
          <p role="status" class="text-sm text-muted-foreground">You do not have any event registrations yet.</p>
        </CardContent>
      </Card>
      <ol v-else class="grid gap-3">
        <li v-for="registration in registrations" :key="registration.id">
          <NuxtLink :to="`/attendances/events/${registration.eventId}`" class="group block rounded-[18px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <Card class="gap-0 rounded-[18px] border border-border !bg-transparent p-0 !shadow-none !ring-0 transition-colors duration-150 group-hover:!bg-muted/20 group-focus-visible:!bg-muted/20 group-active:!bg-muted/35">
              <CardHeader class="flex min-w-0 flex-row items-start justify-between gap-4 px-5 pb-0 pt-5 md:px-6 md:pt-6">
                <div class="min-w-0">
                  <h3 class="truncate text-lg font-medium leading-6 tracking-tight">{{ registration.event?.title || registration.eventId }}</h3>
                  <p class="mt-1 text-sm text-muted-foreground">Event {{ registration.event?.eventId || registration.eventId }}</p>
                </div>
                <Badge :class="statusBadge(registration.status)" class="shrink-0">{{ registration.status === 'CONFIRMED' ? 'Registered' : formatStatus(registration.status) }}</Badge>
              </CardHeader>
              <CardContent class="px-5 pb-5 pt-5 md:px-6 md:pb-6">
                <dl class="grid gap-x-8 gap-y-6 text-sm sm:grid-cols-2">
                  <div class="min-w-0 space-y-1.5">
                    <dt class="flex items-center gap-2 font-medium text-muted-foreground"><CalendarDaysIcon :size="16" aria-hidden="true" />Date &amp; time</dt>
                    <dd v-if="registration.event" class="font-medium leading-5"><time>{{ formattedDateTimeRange(registration.event.startAt, registration.event.endAt, registration.event.timeZone) }}</time></dd>
                    <dd v-else class="font-medium leading-5">Event details unavailable</dd>
                    <dd v-if="registration.event" class="text-sm text-muted-foreground">{{ registration.event.timeZone }}</dd>
                  </div>
                  <div class="min-w-0 space-y-1.5">
                    <dt class="flex items-center gap-2 font-medium text-muted-foreground"><MapPinIcon :size="16" aria-hidden="true" />Primary location</dt>
                    <dd class="truncate font-medium leading-5">{{ registration.event?.primaryVenueName || 'Event details unavailable' }}</dd>
                    <dd v-if="registration.event" class="text-sm text-muted-foreground">Primary venue</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </NuxtLink>
        </li>
      </ol>
    </section>
  </main>
</template>
