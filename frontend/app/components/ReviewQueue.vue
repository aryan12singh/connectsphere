<script setup lang="ts">
const requestFetch=useRequestFetch()
import { computed, ref } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { operationIntent } from './request-errors'
import { apiErrorMessage } from './shared/api-error'
import { Field, FieldLabel } from '@/components/ui/field'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { EQUIPMENT_OPTIONS } from './request-form-state'
import { formatDateTime, LAYOUT_LABELS, timeAgo } from './review-queue-helpers'

export interface QueueOrganiser {
  name: string
  company: string
}

export interface QueueItem {
  id: string
  version: number
  title: string
  status: 'SUBMITTED' | 'RETURNED_FOR_AMENDMENT' | 'APPROVED' | 'REJECTED'
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
  allowedActions?: string[]
}

const page = ref(1)
const pageSize = ref(10)

const { data: queue, error: queueError } = await useFetch('/api/review-queue', {
  key: 'coordinator-queue',
  query: computed(() => ({ page: page.value, pageSize: pageSize.value })),
})

// Keep a completed decision out of the visible queue immediately, even while
// the refreshed server response is in flight or cached.
const decidedIds = ref(new Set<string>())

const items = computed(() => {
  const value = queue.value as { requests?: unknown } | null | undefined
  const requests = value?.requests
  return Array.isArray(requests) ? (requests as QueueItem[]).filter(item => !decidedIds.value.has(item.id)) : []
})

const total = computed(() => Number((queue.value as { total?: unknown } | null | undefined)?.total) || 0)
const currentPage = computed(() => Number((queue.value as { page?: unknown } | null | undefined)?.page) || page.value)
const hasPreviousPage = computed(() => currentPage.value > 1)
const hasNextPage = computed(() => currentPage.value * pageSize.value < total.value)

const selectedId = ref<string | null>(null)
const selected = computed(() => items.value.find(item => item.id === selectedId.value) ?? items.value[0] ?? null)

const queueFailed = computed(() => queueError.value != null)

const deciding = ref(false)
const notes = ref('')
const intent = operationIntent()
const decisionError = ref('')
const hasDecisionError = computed(() => decisionError.value !== '')
const amendmentsPopoverOpen = ref(false)
const amendmentReason = ref('')

function select(id: string) {
  selectedId.value = id
  decisionError.value = ''
  notes.value = ''
  intent.clear()
}

function statusLabel(status: QueueItem['status']) {
  return {
    SUBMITTED: 'Submitted',
    RETURNED_FOR_AMENDMENT: 'Returned for amendment',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
  }[status]
}

function statusClass(status: QueueItem['status']) {
  return {
    SUBMITTED: 'bg-warning-soft text-warning',
    RETURNED_FOR_AMENDMENT: 'bg-warning-soft text-warning',
    APPROVED: 'bg-success-soft text-success',
    REJECTED: 'bg-destructive/10 text-destructive',
  }[status]
}

function canDecide(item: QueueItem) {
  return item.status === 'SUBMITTED' && (item.allowedActions?.some(action => ['approve', 'reject', 'amendments'].includes(action)) ?? true)
}

function goToPage(nextPage: number) {
  if (nextPage < 1 || (nextPage > currentPage.value && !hasNextPage.value))
    return
  page.value = nextPage
  selectedId.value = null
}

function openAmendmentsPopover() {
  amendmentReason.value = ''
  decisionError.value = ''
  amendmentsPopoverOpen.value = true
}

async function decide(decision: 'approve' | 'reject' | 'amendments', reason?: string) {
  const item = selected.value
  if (!item || deciding.value)
    return
  deciding.value = true
  decisionError.value = ''
  try {
    const { data, error } = await useFetch(`/api/events/${item.id}/decision`, {
      method: 'POST',
      body: { decision, ...(reason ? { reason } : {}) },
    })
    if (error.value || !data.value) {
      decisionError.value = 'Could not record your decision. Please try again.'
      return
    }
    decidedIds.value = new Set([...decidedIds.value, item.id])
    selectedId.value = null
    amendmentsPopoverOpen.value = false
    amendmentReason.value = ''
    await refreshNuxtData('coordinator-queue')
  }
  catch (e) {
    decisionError.value = apiErrorMessage(e,'Could not record your decision. Please retry.')
  }
  finally {
    deciding.value = false
  }
}

async function submitAmendments() {
  const reason = amendmentReason.value.trim()
  if (!reason) {
    decisionError.value = 'A reason for amendments is required.'
    return
  }
  await decide('amendments', reason)
}
</script>

<template>
  <div class="mx-auto w-full max-w-[90rem] px-5 py-6 md:px-8 md:py-8">
    <div>
      <h1 class="text-3xl font-semibold tracking-tight md:text-4xl">
        Review queue
      </h1>
      <p class="mt-1 text-sm text-muted-foreground md:text-base">
        Event requests assigned to you, including completed review decisions.
      </p>
    </div>

    <p v-if="queueFailed" role="alert" class="mt-6 text-sm text-destructive">
      The review queue is unavailable right now. Please try again later.
    </p>
    <p v-else-if="items.length === 0" role="status" class="mt-6 text-sm text-muted-foreground">
      No requests awaiting review; no event requests are assigned to you right now.
    </p>
    <div v-else class="mt-6 grid items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <ul aria-label="Assigned event requests" class="grid gap-3">
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
              <Badge variant="outline" class="shrink-0 border-transparent" :class="statusClass(item.status)">
                <span aria-hidden="true" class="size-1.5 rounded-full bg-current" />
                {{ statusLabel(item.status) }}
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
            <Badge variant="outline" class="border-transparent" :class="statusClass(selected.status)">
              <span aria-hidden="true" class="size-1.5 rounded-full bg-current" />
              {{ statusLabel(selected.status) }}
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
                Under Review
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
          <NuxtLink :to="`/requests/${selected.id}`" class="mt-3 inline-block underline">Full request and history</NuxtLink>
          <label for="decision-notes" class="mt-4 block text-sm">Reason / amendment comments (required for return or rejection)</label>
          <textarea id="decision-notes" v-model="notes" maxlength="500" :disabled="deciding" class="mt-2 w-full rounded-xl border bg-input/50 p-3" />
          <div class="mt-4 flex flex-wrap gap-2.5">
            <Button v-if="canDecide(selected)" size="sm" :disabled="deciding" @click="decide('approve')">
              Approve
            </Button>
            <Popover v-if="canDecide(selected)" v-model:open="amendmentsPopoverOpen">
              <PopoverAnchor as-child>
                <Button size="sm" variant="secondary" :disabled="deciding" @click="openAmendmentsPopover">
                  Ask for amendments
                </Button>
              </PopoverAnchor>
              <PopoverContent side="bottom" align="start" class="w-80">
                <div class="grid gap-1">
                  <h3 class="text-sm font-semibold">Reason for amendments</h3>
                  <p class="text-xs text-muted-foreground">Tell the organiser what needs to be updated before resubmission.</p>
                </div>
                <form class="grid gap-3" @submit.prevent="submitAmendments">
                  <Field class="gap-2">
                    <FieldLabel for="amendment-reason">Reason <span aria-hidden="true">*</span></FieldLabel>
                    <textarea id="amendment-reason" v-model="amendmentReason" data-testid="amendment-reason" rows="3" required placeholder="Describe the requested amendments…" class="min-h-20 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                  </Field>
                  <p v-if="hasDecisionError" role="alert" class="text-xs text-destructive">{{ decisionError }}</p>
                  <div class="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="ghost" @click="amendmentsPopoverOpen = false">Cancel</Button>
                    <Button type="submit" size="sm" data-testid="confirm-amendments" :disabled="deciding || !amendmentReason.trim()">Submit</Button>
                  </div>
                </form>
              </PopoverContent>
            </Popover>
            <Button
              size="sm"
              variant="secondary"
              disabled
              title="Coordinator reassignment is not available yet"
            >
              Change coordinator
            </Button>
            <Button v-if="canDecide(selected)" size="sm" variant="destructive" :disabled="deciding" @click="decide('reject')">
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

        <div v-if="total > pageSize || currentPage > 1" class="flex items-center justify-between gap-3 text-sm text-muted-foreground" aria-label="Review queue pagination">
          <span>Page {{ currentPage }} of {{ Math.max(1, Math.ceil(total / pageSize)) }}</span>
          <div class="flex gap-2">
            <Button size="sm" variant="outline" :disabled="!hasPreviousPage" @click="goToPage(currentPage - 1)">Previous</Button>
            <Button size="sm" variant="outline" :disabled="!hasNextPage" @click="goToPage(currentPage + 1)">Next</Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
