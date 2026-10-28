<script setup lang="ts">
// CS-81 / CS-30 (Week 7): the Coordinator Lead's queue. A submitted request waits
// here, unassigned, until a Lead picks a Coordinator. "Assigned by me" lists open
// requests this Lead assigned so they can be handed to someone else. The event
// service enforces Lead-only access, oldest-first order and every assignment rule.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { apiErrorMessage } from '@/components/shared/api-error'
import { timeAgo } from '@/components/events/review-queue-helpers'

definePageMeta({ permission: 'assignments.view' })
useHead({ title: 'Unassigned Queue | ConnectSphere' })

interface LeadItem {
  id: string
  version: number
  eventName: string
  status: string
  submittedAt: string | null
  startAt: string | null
  endAt: string | null
  timeZone: string
  expectedAttendance: number | null
  purpose: string
  venueType: string | null
  coordinatorId: string | null
  organiser: { name: string, company: string }
  allowedActions: string[]
}
interface CoordinatorOption { id: string, name: string }

const requestFetch = useRequestFetch()
const { user } = useUserSession()
const view = ref<'unassigned' | 'assigned'>('unassigned')

const { data: queue, error: queueError, refresh } = await useFetch('/api/lead-queue', {
  key: 'lead-queue',
  query: computed(() => ({ view: view.value, pageSize: 100 })),
})

const items = computed(() => {
  const value = queue.value as { items?: unknown } | null | undefined
  return Array.isArray(value?.items) ? (value!.items as LeadItem[]) : []
})
const selectedId = ref<string | null>(null)
const selected = computed(() => items.value.find(item => item.id === selectedId.value) ?? items.value[0] ?? null)
const queueFailed = computed(() => queueError.value != null)

const message = ref('')
const errorMessage = ref('')
const coordinatorOptions = ref<CoordinatorOption[]>([])
const coordinatorNames = ref<Record<string, string>>({})
const assignOpen = ref(false)
const chosenCoordinatorId = ref('')
const assigning = ref(false)

const choices = computed(() => coordinatorOptions.value.filter(option => option.id !== selected.value?.coordinatorId))
const isAssignedView = computed(() => view.value === 'assigned')
const actionLabel = computed(() => (isAssignedView.value ? 'Change coordinator' : 'Assign coordinator'))

function select(id: string) {
  selectedId.value = id
  errorMessage.value = ''
  message.value = ''
  assignOpen.value = false
}

async function setView(next: 'unassigned' | 'assigned') {
  if (view.value === next)
    return
  view.value = next
  selectedId.value = null
  message.value = ''
  errorMessage.value = ''
  assignOpen.value = false
  await refresh()
}

function formatWhen(item: LeadItem) {
  if (!item.startAt)
    return 'Date to be confirmed'
  const options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short', ...(item.timeZone ? { timeZone: item.timeZone } : {}) }
  try {
    const start = new Intl.DateTimeFormat('en-SG', options).format(new Date(item.startAt))
    const end = item.endAt ? new Intl.DateTimeFormat('en-SG', { timeStyle: 'short', ...(item.timeZone ? { timeZone: item.timeZone } : {}) }).format(new Date(item.endAt)) : ''
    return end ? `${start} – ${end}` : start
  }
  catch {
    return item.startAt
  }
}

function coordinatorLabel(item: LeadItem) {
  if (!item.coordinatorId)
    return 'Unassigned'
  return coordinatorNames.value[item.coordinatorId] ?? 'Assigned'
}

async function loadCoordinators(showError = false) {
  try {
    const result = await requestFetch<{ items?: CoordinatorOption[] }>('/api/coordinators')
    coordinatorOptions.value = Array.isArray(result?.items) ? result.items : []
    coordinatorNames.value = Object.fromEntries(coordinatorOptions.value.map(option => [option.id, option.name]))
  }
  catch {
    coordinatorOptions.value = []
    if (showError)
      errorMessage.value = 'Could not load the list of Coordinators. Please try again.'
  }
}

async function openAssign() {
  chosenCoordinatorId.value = ''
  errorMessage.value = ''
  message.value = ''
  assignOpen.value = true
  await loadCoordinators(true)
}

async function submitAssign() {
  const item = selected.value
  if (!item || !chosenCoordinatorId.value || assigning.value)
    return
  assigning.value = true
  errorMessage.value = ''
  try {
    const path = isAssignedView.value ? 'reassign' : 'assign'
    await requestFetch(`/api/events/${item.id}/${path}`, {
      method: 'POST',
      body: { coordinatorId: chosenCoordinatorId.value, version: item.version },
    })
    assignOpen.value = false
    message.value = `${item.eventName} is now with ${coordinatorNames.value[chosenCoordinatorId.value] ?? 'the chosen Coordinator'}.`
    selectedId.value = null
    await refresh()
  }
  catch (e) {
    errorMessage.value = apiErrorMessage(e, isAssignedView.value ? 'Could not change the coordinator. Please retry.' : 'Could not assign the Coordinator. Please retry.')
    // Someone else may have changed it; show the latest queue.
    await refresh()
  }
  finally {
    assigning.value = false
  }
}

// Keep the queue fresh without a reload (draft target: about five seconds).
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void loadCoordinators()
  timer = setInterval(() => { if (!assigning.value && !assignOpen.value) void refresh() }, 5000)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <main class="mx-auto w-full max-w-[90rem] px-5 py-6 md:px-8 md:py-8">
    <h1 class="text-3xl font-semibold tracking-tight md:text-4xl">Unassigned Queue</h1>
    <p class="mt-1 text-sm text-muted-foreground md:text-base">
      Signed in as {{ user?.name }} (Coordinator Lead). Pick the Coordinator for each new request. You cannot approve, reject or confirm events, or manage venues.
    </p>

    <div class="mt-5 flex gap-2" role="tablist" aria-label="Lead queues">
      <Button size="sm" role="tab" data-testid="tab-unassigned" :aria-selected="view === 'unassigned'" :variant="view === 'unassigned' ? 'default' : 'secondary'" @click="setView('unassigned')">
        Unassigned
      </Button>
      <Button size="sm" role="tab" data-testid="tab-assigned" :aria-selected="view === 'assigned'" :variant="view === 'assigned' ? 'default' : 'secondary'" @click="setView('assigned')">
        Assigned by me
      </Button>
    </div>

    <p v-if="message" role="status" data-testid="lead-queue-message" class="mt-4 text-sm text-success">{{ message }}</p>
    <p v-if="queueFailed" role="alert" class="mt-6 text-sm text-destructive">
      The queue is unavailable right now. Please try again later.
    </p>
    <p v-else-if="items.length === 0" role="status" data-testid="lead-queue-empty" class="mt-6 text-sm text-muted-foreground">
      {{ isAssignedView ? 'You have no open assignments right now.' : 'No requests are waiting for a Coordinator. New submissions will appear here.' }}
    </p>
    <div v-else class="mt-6 grid items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <ul :aria-label="isAssignedView ? 'Requests you assigned' : 'Unassigned event requests'" class="grid gap-3">
        <li v-for="item in items" :key="item.id">
          <button
            type="button"
            data-testid="lead-queue-item"
            :aria-current="selected?.id === item.id ? 'true' : undefined"
            :aria-label="`Open ${item.eventName}`"
            class="w-full rounded-[18px] border px-[18px] py-4 text-left transition-colors"
            :class="selected?.id === item.id ? 'border-primary bg-secondary' : 'border-border bg-card hover:bg-muted/50'"
            @click="select(item.id)"
          >
            <span class="flex items-center justify-between gap-2">
              <span class="min-w-0 flex-1 truncate text-sm">{{ item.eventName }}</span>
              <Badge variant="outline" class="shrink-0 border-transparent bg-warning-soft text-warning">{{ isAssignedView ? coordinatorLabel(item) : 'Unassigned' }}</Badge>
            </span>
            <span class="mt-1 block truncate text-xs text-muted-foreground">
              {{ item.organiser.name }}{{ item.organiser.company ? ` · ${item.organiser.company}` : '' }}
            </span>
            <span class="block text-xs text-muted-foreground">Submitted {{ timeAgo(item.submittedAt) }}</span>
          </button>
        </li>
      </ul>

      <Card v-if="selected" :key="selected.id" class="min-w-0 p-6 md:p-7" data-testid="lead-queue-summary">
        <h2 class="text-xl font-medium">{{ selected.eventName }}</h2>
        <dl class="mt-4 grid gap-3">
          <div class="flex items-start justify-between gap-4">
            <dt class="text-xs text-muted-foreground">Request ID</dt>
            <dd class="text-right text-sm break-all">{{ selected.id }}</dd>
          </div>
          <div class="flex items-start justify-between gap-4">
            <dt class="text-xs text-muted-foreground">Organiser</dt>
            <dd class="text-right text-sm">{{ selected.organiser.name }}{{ selected.organiser.company ? ` · ${selected.organiser.company}` : '' }}</dd>
          </div>
          <div class="flex items-start justify-between gap-4">
            <dt class="text-xs text-muted-foreground">Proposed date &amp; time</dt>
            <dd class="text-right text-sm">{{ formatWhen(selected) }}</dd>
          </div>
          <div class="flex items-start justify-between gap-4">
            <dt class="text-xs text-muted-foreground">Expected attendance</dt>
            <dd class="text-right text-sm">{{ selected.expectedAttendance ?? '—' }} attendees</dd>
          </div>
          <div class="flex items-start justify-between gap-4">
            <dt class="text-xs text-muted-foreground">Purpose</dt>
            <dd class="text-right text-sm">{{ selected.purpose || '—' }}</dd>
          </div>
          <div class="flex items-start justify-between gap-4">
            <dt class="text-xs text-muted-foreground">Submitted</dt>
            <dd class="text-right text-sm">{{ timeAgo(selected.submittedAt) }}</dd>
          </div>
          <div class="flex items-start justify-between gap-4">
            <dt class="text-xs text-muted-foreground">Coordinator</dt>
            <dd class="text-right text-sm" data-testid="lead-queue-coordinator">{{ coordinatorLabel(selected) }}</dd>
          </div>
        </dl>
        <p v-if="errorMessage" role="alert" class="mt-3 text-sm text-destructive">{{ errorMessage }}</p>
        <div class="mt-5 flex flex-wrap gap-2.5">
          <Popover v-if="selected.allowedActions.includes('assign') || selected.allowedActions.includes('reassign')" v-model:open="assignOpen">
            <PopoverAnchor as-child>
              <Button size="sm" data-testid="assign-coordinator" :disabled="assigning" @click="openAssign">
                {{ actionLabel }}
              </Button>
            </PopoverAnchor>
            <PopoverContent side="bottom" align="start" class="w-80">
              <div class="grid gap-1">
                <h3 class="text-sm font-semibold">{{ isAssignedView ? 'Hand this request to another Coordinator' : 'Choose the Coordinator for this request' }}</h3>
                <p class="text-xs text-muted-foreground">
                  {{ isAssignedView ? 'It will leave their queue and appear in the new Coordinator\'s.' : 'It will leave this queue and appear in theirs.' }}
                </p>
              </div>
              <form class="grid gap-3" @submit.prevent="submitAssign">
                <Field class="gap-2">
                  <FieldLabel for="lead-coordinator">Coordinator <span aria-hidden="true">*</span></FieldLabel>
                  <select id="lead-coordinator" v-model="chosenCoordinatorId" data-testid="new-coordinator" required class="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="" disabled>Choose a Coordinator…</option>
                    <option v-for="option in choices" :key="option.id" :value="option.id">{{ option.name }}</option>
                  </select>
                </Field>
                <p v-if="errorMessage" role="alert" class="text-xs text-destructive">{{ errorMessage }}</p>
                <div class="flex justify-end gap-2">
                  <Button type="button" size="sm" variant="ghost" @click="assignOpen = false">Cancel</Button>
                  <Button type="submit" size="sm" data-testid="confirm-assign" :disabled="assigning || !chosenCoordinatorId">{{ isAssignedView ? 'Change' : 'Assign' }}</Button>
                </div>
              </form>
            </PopoverContent>
          </Popover>
        </div>
      </Card>
    </div>
  </main>
</template>
