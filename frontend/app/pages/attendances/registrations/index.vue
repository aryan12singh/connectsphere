<script setup lang="ts">
import { computed, ref } from 'vue'
import { CalendarDaysIcon, MapPinIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { withdrawalReason } from '~~/lib/attendance-state'

useHead({ title: 'My registrations | ConnectSphere' })
const { data, error, refresh } = await useFetch<{ registrations: Array<{
  id: string, eventId: string, status: string, registeredAt: string, withdrawnAt?: string | null,
  event?: { eventId: string, title: string, startAt: string, endAt: string, timeZone: string, primaryVenueName: string | null, withdrawalEnabled?: boolean, withdrawalCutoffAt?: string | null }
}> }>('/api/attendances/registrations')
const registrations = computed(() => data.value?.registrations ?? [])
const withdrawingId = ref<string | null>(null)
const withdrawErrors = ref<Record<string, string>>({})
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

async function withdrawRegistration(registration: { id: string, eventId: string, event?: { title: string } }) {
  const eventName = registration.event?.title || registration.eventId
  if (!window.confirm(`Withdraw your registration for ${eventName}?`)) return
  withdrawingId.value = registration.id
  withdrawErrors.value = { ...withdrawErrors.value, [registration.id]: '' }
  try {
    const result = await $fetch<{ registration: { id: string, status: string, withdrawnAt?: string | null } }>(`/api/attendances/registrations/${encodeURIComponent(registration.id)}/withdraw`, { method: 'POST' })
    if (data.value) data.value.registrations = data.value.registrations.map(row => row.id === registration.id ? { ...row, ...result.registration } : row)
    await refresh()
  }
  catch (cause: any) {
    withdrawErrors.value = { ...withdrawErrors.value, [registration.id]: cause?.data?.data?.error?.message || cause?.data?.statusMessage || 'Unable to withdraw this registration.' }
    await refresh()
    const refreshed = data.value?.registrations.find(row => row.id === registration.id)
    const code = cause?.data?.data?.error?.code
    if (refreshed && ['WITHDRAWAL_DISABLED', 'WITHDRAWAL_CLOSED'].includes(code) && withdrawalReason(refreshed.event)) withdrawErrors.value = { ...withdrawErrors.value, [registration.id]: '' }
  }
  finally { withdrawingId.value = null }
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
          <Card class="gap-0 rounded-[18px] border border-border !bg-transparent p-0 !shadow-none !ring-0">
            <NuxtLink :to="`/attendances/events/${registration.eventId}`" class="group block rounded-t-[18px] text-foreground outline-none transition-colors duration-150 hover:bg-muted/20 focus-visible:bg-muted/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-muted/35">
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
            </NuxtLink>
            <CardContent v-if="registration.status === 'CONFIRMED' || registration.status === 'WITHDRAWN'" class="border-t border-border px-5 py-4 md:px-6">
              <p v-if="registration.status === 'WITHDRAWN'" role="status" class="text-sm text-muted-foreground">
                Withdrawn<span v-if="registration.withdrawnAt"> · {{ formattedDate(registration.withdrawnAt, registration.event?.timeZone || 'Asia/Singapore') }}</span>
              </p>
              <div v-else class="flex flex-wrap items-start justify-between gap-3">
                <p class="text-sm text-muted-foreground">Need to cancel your attendance?</p>
                <div class="grid gap-1">
                  <Button variant="outline" size="sm" :disabled="withdrawingId === registration.id || Boolean(withdrawalReason(registration.event))" :aria-label="`Withdraw registration for ${registration.event?.title || registration.eventId}`" @click="withdrawRegistration(registration)">
                    {{ withdrawingId === registration.id ? 'Withdrawing…' : 'Withdraw registration' }}
                  </Button>
                  <p v-if="withdrawalReason(registration.event)" class="text-xs text-muted-foreground">{{ withdrawalReason(registration.event) }}</p>
                </div>
              </div>
              <p v-if="withdrawErrors[registration.id]" role="alert" class="mt-3 text-sm text-destructive">{{ withdrawErrors[registration.id] }}</p>
            </CardContent>
          </Card>
        </li>
      </ol>
    </section>
  </main>
</template>
