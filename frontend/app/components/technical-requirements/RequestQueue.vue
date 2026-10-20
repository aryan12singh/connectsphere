<script setup lang="ts">
import { computed, ref } from 'vue'
import { BookmarkIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, SearchIcon, UserIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type RequestItem = {
  eventRequestId: string
  version: number
  status: string
  equipmentPeriod: { startAt: string, endAt: string } | null
  event: { title: string, startAt: string, endAt: string, timeZone: string, submitter: { name: string } } | null
}

const props = defineProps<{ requests: RequestItem[], selectedId: string }>()
const emit = defineEmits<{ select: [request: RequestItem] }>()
const search = ref('')
const page = ref(1)
const pageSize = 5
const filtered = computed(() => props.requests.filter((request) =>
  `${request.event?.title ?? ''} ${request.eventRequestId} ${request.event?.submitter.name ?? ''}`.toLowerCase().includes(search.value.toLowerCase()),
))
const visible = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))

function period(startAt?: string, endAt?: string, timeZone?: string) {
  if (!startAt || !endAt) return 'Not available'
  const format = (value: string) => new Intl.DateTimeFormat('en-SG', { timeZone: timeZone || 'UTC', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  return `${format(startAt)} – ${format(endAt)}`
}

function statusLabel(status: string) {
  if (status === 'APPROVED') return 'Approved'
  if (status === 'REJECTED') return 'Rejected'
  return 'Under review'
}

function statusClass(status: string) {
  if (status === 'APPROVED') return 'border-transparent bg-success-soft text-success'
  if (status === 'REJECTED') return 'border-transparent bg-destructive/10 text-destructive'
  return 'border-transparent bg-warning-soft text-warning'
}
</script>

<template>
  <nav aria-label="Technical requests" class="grid w-full min-w-0 grid-cols-1 content-start gap-3 lg:h-full lg:min-h-0 lg:overflow-x-hidden lg:overflow-y-auto lg:pr-2">
    <div class="relative w-full min-w-0">
      <SearchIcon aria-hidden="true" class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        v-model="search"
        aria-label="Search technical requests"
        placeholder="Search for an event..."
        class="pl-9"
        @update:model-value="page = 1"
      />
    </div>

    <Button
      v-for="request in visible"
      :key="request.eventRequestId"
      type="button"
      variant="outline"
      :aria-current="selectedId === request.eventRequestId ? 'true' : undefined"
      :class="cn('h-auto w-full min-w-0 max-w-full flex-col items-stretch justify-start gap-2 whitespace-normal rounded-xl p-4 text-left shadow-sm', selectedId === request.eventRequestId ? 'border-primary bg-secondary' : 'bg-card hover:bg-muted/50')"
      @click="emit('select', request)"
    >
      <span class="flex w-full min-w-0 items-center justify-between gap-2">
        <span class="truncate font-medium text-foreground">{{ request.event?.title || `Event request ${request.eventRequestId}` }}</span>
        <Badge :class="statusClass(request.status)">{{ statusLabel(request.status) }}</Badge>
      </span>
      <span class="flex w-full min-w-0 items-start gap-2 text-sm font-normal text-foreground">
        <ClockIcon aria-hidden="true" class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span class="min-w-0 text-left">{{ period(request.event?.startAt, request.event?.endAt, request.event?.timeZone) }}</span>
      </span>
      <span class="flex w-full items-center gap-2 text-sm font-normal text-foreground">
        <UserIcon aria-hidden="true" class="size-4 shrink-0 text-muted-foreground" />
        <span class="truncate">Submitted by {{ request.event?.submitter.name || 'Unknown' }}</span>
      </span>
      <span class="flex w-full items-center gap-2 text-sm font-normal text-foreground">
        <BookmarkIcon aria-hidden="true" class="size-4 shrink-0 text-muted-foreground" />
        <span>v{{ request.version }}</span>
      </span>
      <span class="sr-only">Event request {{ request.eventRequestId }}</span>
    </Button>

    <p v-if="filtered.length === 0" class="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
      No matching technical requests.
    </p>

    <div class="flex items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>Page {{ page }} of {{ pageCount }}</span>
      <div class="flex gap-2">
        <Button variant="outline" size="icon" aria-label="Previous page" :disabled="page <= 1" @click="page--">
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        <Button variant="outline" size="icon" aria-label="Next page" :disabled="page >= pageCount" @click="page++">
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  </nav>
</template>
