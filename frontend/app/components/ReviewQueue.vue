<script setup lang="ts">
import { computed, ref } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EQUIPMENT_OPTIONS } from './request-form-state'
import { formatDateTime, LAYOUT_LABELS, timeAgo } from './review-queue-helpers'

export interface QueueOrganiser {
  name: string
  company: string
}

export interface QueueItem {
  id: string
  title: string
  status: 'SUBMITTED'
  submittedAt: string | null
  coordinatorId: string | null
  organiser: QueueOrganiser
  eventName: string
  purpose: string
  description: string
  proposedDate: string
  expectedAttendance: number
  startTime: string
  endTime: string
  timeZone: string
  minimumCapacity: number | null
  preferredLayout: string
  venueType: string
  venueRequirements: string
  accessibilityNeeds: string[]
  accessibilityDetails: string
  equipmentNeeds: string[]
  technicalDetails: string
}

const { data: queue, error: queueError } = await useFetch('/api/review-queue', {
  key: 'coordinator-queue',
})

const removedIds = ref<string[]>([])

const items = computed(() => {
  const value = queue.value as { requests?: unknown } | null | undefined
  const requests = value?.requests
  const all = Array.isArray(requests) ? (requests as QueueItem[]) : []
  // Decided rows leave the queue at once; the refresh below reconciles.
  return all.filter(item => !removedIds.value.includes(item.id))
})

const selectedId = ref<string | null>(null)
const selected = computed(() => items.value.find(item => item.id === selectedId.value) ?? items.value[0] ?? null)

const queueFailed = computed(() => queueError.value != null)

const deciding = ref(false)
const decisionError = ref('')
const hasDecisionError = computed(() => decisionError.value !== '')

function select(id: string) {
  selectedId.value = id
  decisionError.value = ''
}

async function decide(decision: 'approve' | 'reject' | 'amendments') {
  const item = selected.value
  if (!item || deciding.value)
    return
  deciding.value = true
  decisionError.value = ''
  try {
    const { data, error } = await useFetch(`/api/events/${item.id}/decision`, {
      method: 'POST',
      body: { decision },
    })
    if (error.value || !data.value) {
      decisionError.value = 'Could not record your decision. Please try again.'
      return
    }
    removedIds.value.push(item.id)
    selectedId.value = items.value[0]?.id ?? null
    await refreshNuxtData('coordinator-queue')
  }
  catch {
    decisionError.value = 'Could not record your decision. Please try again.'
  }
  finally {
    deciding.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-[90rem] px-5 py-6 md:px-8 md:py-8">
    <div>
      <h1 class="text-3xl font-semibold tracking-tight md:text-4xl">
        Review queue
      </h1>
      <p class="mt-1 text-sm text-muted-foreground md:text-base">
        Submitted event requests awaiting coordinator review and approval.
      </p>
    </div>

    <p v-if="queueFailed" role="alert" class="mt-6 text-sm text-destructive">
      The review queue is unavailable right now. Please try again later.
    </p>
    <p v-else-if="items.length === 0" role="status" class="mt-6 text-sm text-muted-foreground">
      No requests awaiting review right now.
    </p>
    <div v-else class="mt-6 grid items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <ul aria-label="Requests awaiting review" class="grid gap-3">
        <li v-for="item in items" :key="item.id">
          <button
            type="button"
            data-testid="queue-item"
            :aria-current="selected?.id === item.id ? 'true' : undefined"
            :aria-label="`Review ${item.title}`"
            class="w-full rounded-[18px] border px-[18px] py-4 text-left transition-colors"
            :class="selected?.id === item.id ? 'border-primary bg-secondary' : 'border-border bg-card hover:bg-muted/50'"
            @click="select(item.id)"
          >
            <span class="flex items-center justify-between gap-2">
              <span class="min-w-0 flex-1 truncate text-sm">{{ item.title }}</span>
              <Badge variant="outline" class="shrink-0 border-transparent bg-warning-soft text-warning">
                <span aria-hidden="true" class="size-1.5 rounded-full bg-current" />
                Submitted
              </Badge>
            </span>
            <span class="mt-1 block truncate text-xs text-muted-foreground">
              {{ item.organiser.name }}{{ item.organiser.company ? ` · ${item.organiser.company}` : '' }}
            </span>
            <span class="block text-xs text-muted-foreground">
              Submitted {{ timeAgo(item.submittedAt) }}
            </span>
          </button>
        </li>
      </ul>

      <div v-if="selected" :key="selected.id" class="grid min-w-0 gap-5">
        <Card class="p-6 md:p-7">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-xl font-medium">
              {{ selected.title }}
            </h2>
            <Badge variant="outline" class="border-transparent bg-warning-soft text-warning">
              <span aria-hidden="true" class="size-1.5 rounded-full bg-current" />
              Submitted
            </Badge>
          </div>
          <dl class="mt-4 flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <dt class="text-xs text-muted-foreground">
                Organiser
              </dt>
              <dd class="mt-0.5 text-sm">
                {{ selected.organiser.name }}{{ selected.organiser.company ? ` · ${selected.organiser.company}` : '' }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">
                Submitted
              </dt>
              <dd class="mt-0.5 text-sm">
                {{ timeAgo(selected.submittedAt) }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">
                Assigned coordinator
              </dt>
              <dd class="mt-0.5 text-sm">
                {{ selected.coordinatorId ? 'Assigned' : 'Unassigned' }}
              </dd>
            </div>
          </dl>
          <p v-if="hasDecisionError" role="alert" class="mt-3 text-sm text-destructive">
            {{ decisionError }}
          </p>
          <div class="mt-4 flex flex-wrap gap-2.5">
            <Button size="sm" :disabled="deciding" @click="decide('approve')">
              Approve
            </Button>
            <Button size="sm" variant="secondary" :disabled="deciding" @click="decide('amendments')">
              Ask for amendments
            </Button>
            <Button
              size="sm"
              variant="secondary"
              title="Coordinator reassignment is not available yet"
            >
              Change coordinator
            </Button>
            <Button size="sm" variant="destructive" :disabled="deciding" @click="decide('reject')">
              Reject
            </Button>
          </div>
        </Card>

        <Card class="p-6 md:p-7">
          <h3 class="text-lg">
            Event details
          </h3>
          <dl class="mt-4 grid gap-3">
            <div class="flex items-start justify-between gap-4">
              <dt class="text-xs text-muted-foreground">
                Purpose
              </dt>
              <dd class="text-right text-sm">
                {{ selected.purpose || '—' }}
              </dd>
            </div>
            <div class="flex items-start justify-between gap-4">
              <dt class="text-xs text-muted-foreground">
                Proposed date &amp; time
              </dt>
              <dd class="text-right text-sm">
                {{ formatDateTime(selected.proposedDate, selected.startTime, selected.endTime) }}
              </dd>
            </div>
            <div class="flex items-start justify-between gap-4">
              <dt class="text-xs text-muted-foreground">
                Expected attendance
              </dt>
              <dd class="text-right text-sm">
                {{ selected.expectedAttendance }} attendees
              </dd>
            </div>
          </dl>
          <p v-if="selected.description" class="mt-4 text-sm text-muted-foreground">
            {{ selected.description }}
          </p>
        </Card>

        <div class="grid items-start gap-5 md:grid-cols-2">
          <Card class="p-6 md:p-7">
            <h3 class="text-lg">
              Venue requirements
            </h3>
            <dl class="mt-4 grid gap-3">
              <div class="flex items-start justify-between gap-4">
                <dt class="text-xs text-muted-foreground">
                  Minimum capacity
                </dt>
                <dd class="text-right text-sm">
                  {{ selected.minimumCapacity ?? '—' }}
                </dd>
              </div>
              <div class="flex items-start justify-between gap-4">
                <dt class="text-xs text-muted-foreground">
                  Preferred layout
                </dt>
                <dd class="text-right text-sm">
                  {{ LAYOUT_LABELS[selected.preferredLayout] ?? selected.preferredLayout ?? '—' }}
                </dd>
              </div>
              <div class="flex items-start justify-between gap-4">
                <dt class="text-xs text-muted-foreground">
                  Accessibility
                </dt>
                <dd class="text-right text-sm">
                  {{ selected.accessibilityDetails || selected.accessibilityNeeds.join(', ') || 'None specified' }}
                </dd>
              </div>
            </dl>
          </Card>

          <Card class="p-6 md:p-7">
            <h3 class="text-lg">
              Equipment requirements
            </h3>
            <dl class="mt-4 grid gap-3">
              <div v-for="option in EQUIPMENT_OPTIONS" :key="option" class="flex items-start justify-between gap-4">
                <dt class="text-xs text-muted-foreground">
                  {{ option }}
                </dt>
                <dd class="text-right text-sm">
                  {{ selected.equipmentNeeds.includes(option) ? 'Requested' : 'Not requested' }}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  </div>
</template>
