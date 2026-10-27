<script setup lang="ts">
import { ArrowLeftIcon, CalendarDaysIcon, TicketCheckIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const route = useRoute()
const eventId = String(route.params.eventId ?? '')
useHead({ title: 'Your registration | ConnectSphere' })

const { data: registration, error } = await useFetch<{
  eventId: string, userId: string, status: string, registeredAt: string
}>(`/api/attendances/registrations/${encodeURIComponent(eventId)}`)

function statusBadge(status: string) {
  if (status === 'CONFIRMED') return 'bg-success-soft text-success'
  if (status === 'CANCELLED') return 'bg-destructive/10 text-destructive'
  if (status === 'PENDING') return 'bg-warning-soft text-warning'
  return 'bg-muted/50 text-muted'
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
  <main class="mx-auto w-full max-w-3xl px-5 py-8 md:px-8 md:py-12">
    <NuxtLink to="/attendances" class="inline-flex items-center gap-2 rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      <ArrowLeftIcon :size="16" aria-hidden="true" />Back to your events
    </NuxtLink>

    <Card v-if="error" class="mt-8 max-w-2xl" aria-labelledby="registration-unavailable-heading">
      <CardHeader>
        <CardTitle id="registration-unavailable-heading" class="text-2xl">Registration not found</CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-sm leading-6 text-muted-foreground">You do not have a registration for this event, or you do not have permission to view it.</p>
      </CardContent>
    </Card>

    <template v-else-if="registration">
      <header class="mt-7">
        <div class="flex flex-wrap items-center gap-2">
          <Badge :class="statusBadge(registration.status)">{{ formatStatus(registration.status) }}</Badge>
          <span class="text-sm text-muted-foreground">Event {{ registration.eventId }}</span>
        </div>
        <h1 class="mt-4 flex items-center gap-3 text-3xl font-medium tracking-tight md:text-4xl"><TicketCheckIcon :size="26" aria-hidden="true" />Your registration</h1>
      </header>

      <Card class="mt-8 gap-0 rounded-[18px] border border-border !bg-transparent p-0 !shadow-none !ring-0">
        <CardHeader class="px-5 pb-0 pt-5 md:px-6 md:pt-6">
          <CardTitle class="text-base font-medium leading-6">Registration details</CardTitle>
        </CardHeader>
        <CardContent class="px-5 pb-5 pt-5 md:px-6 md:pb-6">
          <dl class="grid gap-5 sm:grid-cols-2">
            <div>
              <dt class="text-sm font-medium text-muted-foreground">Registration status</dt>
              <dd class="mt-1.5 font-medium">{{ formatStatus(registration.status) }}</dd>
            </div>
            <div>
              <dt class="flex items-center gap-2 text-sm font-medium text-muted-foreground"><CalendarDaysIcon :size="16" aria-hidden="true" />Registered at</dt>
              <dd class="mt-1.5 font-medium"><time>{{ new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(registration.registeredAt)) }}</time></dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <nav class="mt-6 flex flex-wrap gap-2" aria-label="Registration actions">
        <Button variant="outline" disabled>
          Manage registration (coming soon – CS-48)
        </Button>
        <Button as-child variant="ghost" class="!text-muted-foreground hover:!text-foreground"><NuxtLink to="/attendances">Back to your events</NuxtLink></Button>
      </nav>
    </template>
  </main>
</template>
