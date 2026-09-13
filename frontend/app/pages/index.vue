<script setup lang="ts">
import { ArrowRightIcon, GalleryVerticalEndIcon } from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardFooter, CardHeader } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchEvents, isEventsResponse } from '@/lib/events'
import type { EventStatus } from '@/lib/events'

const THEME_STORAGE_KEY = 'connectsphere-theme'

const isDark = ref(false)
const activeTab = ref('all')

useHead({
  title: 'Your events | ConnectSphere',
})

const { data, error } = await useAsyncData('organiser-events', () => fetchEvents())

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
    case 'draft':
      return { label: 'Draft', variant: 'outline' as const, class: '', dotted: false }
    case 'submitted':
      return { label: 'Submitted', variant: 'secondary' as const, class: '', dotted: false }
    case 'under-review':
      return { label: 'Under review', variant: 'outline' as const, class: 'border-transparent bg-warning-soft text-warning', dotted: true }
    case 'confirmed':
      return { label: 'Confirmed', variant: 'outline' as const, class: 'border-transparent bg-success-soft text-success', dotted: true }
    case 'planning':
      return { label: 'Planning', variant: 'outline' as const, class: 'border-transparent bg-warning-soft text-warning', dotted: true }
    case 'completed':
      return { label: 'Completed', variant: 'default' as const, class: '', dotted: false }
    case 'rejected':
      return { label: 'Rejected', variant: 'destructive' as const, class: '', dotted: true }
  }
}

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

onMounted(() => {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)
  isDark.value = savedTheme
    ? savedTheme === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches

  applyTheme(isDark.value)
})

watch(isDark, (dark) => {
  if (!import.meta.client)
    return

  applyTheme(dark)
  localStorage.setItem(THEME_STORAGE_KEY, dark ? 'dark' : 'light')
})
</script>

<template>
  <div class="min-h-dvh bg-background text-foreground">
    <header class="flex h-16 items-center justify-between gap-4 border-b border-border px-5 md:px-8">
      <div class="flex min-w-0 items-center gap-5">
        <div class="flex shrink-0 items-center gap-2" aria-label="ConnectSphere">
          <span class="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <GalleryVerticalEndIcon class="size-3.5" aria-hidden="true" />
          </span>
          <span class="truncate text-sm font-medium">ConnectSphere</span>
        </div>

        <nav class="hidden items-center gap-5 text-sm lg:flex" aria-label="Primary">
          <span class="text-muted-foreground">Dashboard</span>
          <NuxtLink to="/" aria-current="page" class="font-medium text-foreground underline decoration-2 underline-offset-[6px]">
            Events
          </NuxtLink>
          <span class="text-muted-foreground">Venues</span>
          <span class="text-muted-foreground">Equipment</span>
        </nav>
      </div>

      <div class="flex shrink-0 items-center gap-3 md:gap-4">
        <div class="flex items-center gap-2">
          <label for="dashboard-theme-toggle" class="text-sm text-muted-foreground">Dark mode</label>
          <Switch
            id="dashboard-theme-toggle"
            v-model="isDark"
            size="sm"
            :aria-label="isDark ? 'Use light mode' : 'Use dark mode'"
          />
        </div>
        <Button size="sm" class="hidden md:inline-flex">
          New event request
        </Button>
        <Avatar size="sm" aria-label="Your account">
          <AvatarFallback>EO</AvatarFallback>
        </Avatar>
      </div>
    </header>

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
        <Button class="hidden shrink-0 md:inline-flex">
          New event request
        </Button>
      </div>
      <Button class="mt-4 w-full md:hidden">
        New event request
      </Button>

      <Tabs v-model="activeTab" class="mt-6">
        <TabsList variant="line" aria-label="Filter events by status" class="h-auto! w-full flex-wrap justify-start gap-x-5 gap-y-3 sm:w-fit">
          <TabsTrigger value="all" data-testid="tab-all" class="flex-none">
            All ({{ countFor('all') }})
          </TabsTrigger>
          <TabsTrigger value="draft" data-testid="tab-draft" class="flex-none">
            Draft ({{ countFor('draft') }})
          </TabsTrigger>
          <TabsTrigger value="submitted" data-testid="tab-submitted" class="flex-none">
            Submitted ({{ countFor('submitted') }})
          </TabsTrigger>
          <TabsTrigger value="under-review" data-testid="tab-under-review" class="flex-none">
            Under review ({{ countFor('under-review') }})
          </TabsTrigger>
          <TabsTrigger value="confirmed" data-testid="tab-confirmed" class="flex-none">
            Confirmed ({{ countFor('confirmed') }})
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed" class="flex-none">
            Completed ({{ countFor('completed') }})
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
        <Card v-for="event in filteredEvents" :key="event.id" data-testid="event-card" class="gap-4 rounded-[18px] p-0">
          <CardHeader class="flex flex-col gap-1 px-4 pt-4">
            <p class="text-[10px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
              {{ event.category }}
            </p>
            <div class="flex flex-col gap-1">
              <h2 class="text-base font-medium leading-6">
                {{ event.title }}
              </h2>
              <p class="truncate text-sm text-muted-foreground" :title="event.meta">
                {{ event.meta }}
              </p>
            </div>
          </CardHeader>
          <CardFooter class="justify-between gap-2 border-t border-border p-4 pt-4!">
            <Badge :variant="badgeFor(event.status).variant" :class="['h-[22px]', badgeFor(event.status).class]">
              <span v-if="badgeFor(event.status).dotted" aria-hidden="true" class="size-1.5 rounded-full bg-current" />
              {{ badgeFor(event.status).label }}
            </Badge>
            <Button variant="ghost" class="h-9 shrink-0 gap-1 px-2.5 text-primary hover:text-primary">
              View details
              <ArrowRightIcon class="size-4" aria-hidden="true" />
            </Button>
          </CardFooter>
        </Card>
      </div>
      <p v-else role="status" class="mt-6 text-sm text-muted-foreground">
        No events match this filter yet.
      </p>
    </main>
  </div>
</template>
