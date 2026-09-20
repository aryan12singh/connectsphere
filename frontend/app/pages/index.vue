<script setup lang="ts">
import { ArrowRightIcon } from '@lucide/vue'
import { computed, ref } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardFooter, CardHeader } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
const activeTab = ref('all')

useHead({
  title: 'Your events | ConnectSphere',
})

// useFetch resolves relative URLs through the request-scoped fetcher, which
// forwards the browser's cookies when this runs on the server (hard refresh).
const { data, error } = await useFetch('/api/events', { key: 'organiser-events' })

type EventStatus
  = | 'DRAFT'
    | 'SUBMITTED'
    | 'RETURNED_FOR_AMENDMENT'
    | 'APPROVED'
    | 'REJECTED'

interface OrganiserEvent {
  id: string
  category: string
  title: string
  meta: string
  status: EventStatus
}

const EVENT_STATUSES: readonly string[] = [
  'DRAFT',
  'SUBMITTED',
  'RETURNED_FOR_AMENDMENT',
  'APPROVED',
  'REJECTED',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Payload shape guard — malformed BFF responses show the unavailable state. */
function isEventsResponse(value: unknown): value is { events: OrganiserEvent[] } {
  return isRecord(value)
    && Array.isArray(value.events)
    && value.events.every(event =>
      isRecord(event)
      && typeof event.id === 'string'
      && typeof event.category === 'string'
      && typeof event.title === 'string'
      && typeof event.meta === 'string'
      && typeof event.status === 'string'
      && EVENT_STATUSES.includes(event.status),
    )
}

const events = computed(() => isEventsResponse(data.value) ? data.value.events : [])
const totalCount = computed(() => events.value.length)

const filteredEvents = computed(() => {
  if (activeTab.value === 'all')
    return events.value
  return events.value.filter(event => event.status === activeTab.value)
})

const statusCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const event of events.value)
    counts.set(event.status, (counts.get(event.status) ?? 0) + 1)
  return counts
})

function countFor(status: string) {
  return status === 'all' ? totalCount.value : (statusCounts.value.get(status) ?? 0)
}

const loadErrorMessage = computed(() => {
  if (!error.value)
    return ''
  return error.value instanceof Error ? error.value.message : 'Failed to load events. Please try again.'
})

const malformedPayload = computed(() => {
  return !error.value && data.value != null && !isEventsResponse(data.value)
})

function badgeFor(status: EventStatus) {
  switch (status) {
    case 'DRAFT':
      return { label: 'Draft', variant: 'outline' as const, class: '', dotted: false }
    case 'SUBMITTED':
      return { label: 'Submitted', variant: 'secondary' as const, class: '', dotted: false }
    case 'RETURNED_FOR_AMENDMENT':
      return { label: 'Returned', variant: 'outline' as const, class: 'border-transparent bg-warning-soft text-warning', dotted: true }
    case 'APPROVED':
      return { label: 'Approved', variant: 'outline' as const, class: 'border-transparent bg-success-soft text-success', dotted: true }
    case 'REJECTED':
      return { label: 'Rejected', variant: 'destructive' as const, class: '', dotted: true }
    default:
      return { label: status, variant: 'outline' as const, class: '', dotted: false }
  }
}
</script>

<template>
  <main class="mx-auto w-full max-w-[90rem] px-5 py-6 md:px-8 md:py-8">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-3xl font-semibold tracking-tight md:text-4xl">
            Your events
          </h1>
          <p class="mt-1 text-sm text-muted-foreground md:text-base">
            Track your submitted requests and view confirmed arrangements.
          </p>
        </div>
        <Button as-child class="hidden shrink-0 md:inline-flex">
          <NuxtLink to="/requests/new">
            New event request
          </NuxtLink>
        </Button>
      </div>
      <Button as-child class="mt-4 w-full md:hidden">
        <NuxtLink to="/requests/new">
          New event request
        </NuxtLink>
      </Button>

      <Tabs v-model="activeTab" class="mt-6">
        <TabsList variant="line" aria-label="Filter events by status" class="h-auto! w-full flex-wrap justify-start gap-x-5 gap-y-3 sm:w-fit">
          <TabsTrigger value="all" data-testid="tab-all" class="flex-none">
            All ({{ countFor('all') }})
          </TabsTrigger>
          <TabsTrigger value="DRAFT" data-testid="tab-draft" class="flex-none">
            Draft ({{ countFor('DRAFT') }})
          </TabsTrigger>
          <TabsTrigger value="SUBMITTED" data-testid="tab-submitted" class="flex-none">
            Submitted ({{ countFor('SUBMITTED') }})
          </TabsTrigger>
          <TabsTrigger value="RETURNED_FOR_AMENDMENT" data-testid="tab-returned" class="flex-none">
            Returned ({{ countFor('RETURNED_FOR_AMENDMENT') }})
          </TabsTrigger>
          <TabsTrigger value="APPROVED" data-testid="tab-approved" class="flex-none">
            Approved ({{ countFor('APPROVED') }})
          </TabsTrigger>
          <TabsTrigger value="REJECTED" data-testid="tab-rejected" class="flex-none">
            Rejected ({{ countFor('REJECTED') }})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <p v-if="loadErrorMessage" role="alert" class="mt-6 text-sm text-destructive">
        {{ loadErrorMessage }}
      </p>
      <p v-else-if="malformedPayload" role="alert" class="mt-6 text-sm text-destructive">
        Events data is unavailable right now. Please try again later.
      </p>
      <div v-else-if="filteredEvents.length > 0" class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card v-for="event in filteredEvents" :key="event.id" data-testid="event-card" class="relative min-w-0 gap-4 rounded-[18px] p-0">
          <NuxtLink :to="`/requests/${event.id}`" class="absolute inset-0 rounded-[18px]" :aria-label="`View ${event.title}`" />
          <CardHeader class="flex min-w-0 flex-col items-stretch gap-1 px-4 pt-4">
            <p class="text-[10px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
              {{ event.category }}
            </p>
            <div class="flex min-w-0 flex-col gap-1">
              <h2 class="text-base font-medium leading-6">
                {{ event.title }}
              </h2>
              <p data-testid="event-meta" class="min-w-0 truncate text-sm text-muted-foreground" :title="event.meta">
                {{ event.meta }}
              </p>
            </div>
          </CardHeader>
          <CardFooter class="justify-between gap-2 border-t border-border p-4 pt-4!">
            <Badge :variant="badgeFor(event.status).variant" :class="['h-[22px]', badgeFor(event.status).class]">
              <span v-if="badgeFor(event.status).dotted" aria-hidden="true" class="size-1.5 rounded-full bg-current" />
              {{ badgeFor(event.status).label }}
            </Badge>
            <Button as-child variant="ghost" class="relative h-9 shrink-0 gap-1 px-2.5 text-primary hover:text-primary">
              <NuxtLink :to="`/requests/${event.id}`">
                View details
                <ArrowRightIcon class="size-4" aria-hidden="true" />
              </NuxtLink>
            </Button>
          </CardFooter>
        </Card>
      </div>
      <p v-else role="status" class="mt-6 text-sm text-muted-foreground">
        No events match this filter yet.
      </p>
  </main>
</template>
