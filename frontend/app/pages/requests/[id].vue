<script setup lang="ts">
import { computed, ref } from 'vue'
import RequestFormPage from '@/components/RequestFormPage.vue'
import { emptyRequestForm, formToPayload } from '@/components/request-form-state'
import type { RequestFormState } from '@/components/request-form-state'

const route = useRoute()
const requestId = computed(() => String((route.params as Record<string, unknown>).id ?? ''))

const { data: record, error: recordError } = await useFetch(`/api/events/${requestId.value}`, {
  key: `event-request-${requestId.value}`,
})

interface LoadedCoordinator {
  name?: unknown
  email?: unknown
}

const coordinator = ref<LoadedCoordinator | null>(null)
const loadedRecord = computed(() => (record.value ?? null) as null | {
  id: string
  status: 'DRAFT' | 'SUBMITTED' | 'RETURNED_FOR_AMENDMENT' | 'APPROVED' | 'REJECTED'
  coordinatorId?: unknown
  eventName?: unknown
} & Record<string, unknown>)

const coordinatorId = computed(() => {
  const value = loadedRecord.value?.coordinatorId
  return typeof value === 'string' ? value : null
})

if (coordinatorId.value) {
  const { data } = await useFetch(`/api/users/${coordinatorId.value}`, {
    key: `event-coordinator-${requestId.value}`,
  })
  coordinator.value = (data.value ?? null) as LoadedCoordinator | null
}

const recordFailed = computed(() => recordError.value != null)

const isDraft = computed(() => loadedRecord.value?.status === 'DRAFT')
const editMode = ref(false)
const canEdit = computed(() => loadedRecord.value?.status !== 'REJECTED')
const mode = computed(() => {
  if (isDraft.value)
    return 'draft' as const
  return editMode.value ? 'edit' as const : 'readonly' as const
})
const isReadonly = computed(() => mode.value === 'readonly')
const isSubmitting = ref(false)
const submitError = ref('')

function toFormState(source: Record<string, unknown>): RequestFormState {
  const text = (value: unknown) => typeof value === 'string' ? value : ''
  const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
  const checked = (value: unknown) => {
    const selected: Record<string, boolean> = {}
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string')
          selected[item] = true
      }
    }
    return selected
  }
  return {
    eventName: text(source.eventName),
    purpose: text(source.purpose),
    description: text(source.description),
    proposedDate: text(source.proposedDate),
    expectedAttendance: count(source.expectedAttendance),
    startTime: text(source.startTime),
    endTime: text(source.endTime),
    timeZone: text(source.timeZone),
    minimumCapacity: count(source.minimumCapacity),
    preferredLayout: text(source.preferredLayout),
    venueType: text(source.venueType),
    venueRequirements: text(source.venueRequirements),
    accessibilityDetails: text(source.accessibilityDetails),
    technicalDetails: text(source.technicalDetails),
    accessibilityNeeds: checked(source.accessibilityNeeds),
    equipmentNeeds: checked(source.equipmentNeeds),
  }
}

const requestForm = ref<RequestFormState>(emptyRequestForm())
if (loadedRecord.value)
  requestForm.value = toFormState(loadedRecord.value)

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  RETURNED_FOR_AMENDMENT: 'Returned',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
}
const statusLabel = computed(() => STATUS_LABELS[loadedRecord.value?.status ?? ''] ?? 'Submitted')
const heading = computed(() => {
  const name = loadedRecord.value && typeof loadedRecord.value.eventName === 'string' ? loadedRecord.value.eventName : ''
  return name || 'Event request'
})

async function save(submit: boolean) {
  if (isSubmitting.value)
    return
  isSubmitting.value = true
  submitError.value = ''
  try {
    const { data, error } = await useFetch(`/api/events/${requestId.value}`, {
      method: 'PUT',
      body: formToPayload(requestForm.value, { submit }),
    })
    if (error.value || !data.value || typeof (data.value as { id?: unknown }).id !== 'string') {
      submitError.value = 'Could not save your request. Please check the highlighted fields and try again.'
      return
    }
    await refreshNuxtData('organiser-events')
    await navigateTo('/')
  }
  catch {
    submitError.value = 'Could not save your request. Please try again.'
  }
  finally {
    isSubmitting.value = false
  }
}

useHead({
  title: 'Event request | ConnectSphere',
})
</script>

<template>
  <main class="mx-auto w-full max-w-[90rem] px-5 pb-32 pt-6 md:px-8 md:py-8 lg:pb-8">
    <p v-if="recordFailed" role="alert" class="mt-6 text-sm text-destructive">
      This request is unavailable. It may not exist or you may not have access to it.
    </p>
    <RequestFormPage
      v-else-if="loadedRecord"
      v-model="requestForm"
      :title="heading"
      :status-label="statusLabel"
      :banner="coordinator"
      :disabled="isReadonly"
      :is-submitting="isSubmitting"
      :submit-error="submitError"
      :mode="mode"
      :can-edit="canEdit"
      @save="() => save(false)"
      @submit="() => save(isDraft)"
      @edit="editMode = true"
    />
    <p v-else class="mt-6 text-sm text-muted-foreground">
      Loading request…
    </p>
  </main>
</template>
