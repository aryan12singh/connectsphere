<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

type EquipmentLine = { equipmentType: string, quantity: number }
type TechnicalRequest = {
  eventRequestId: string
  coordinatorId?: string
  version: number
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  equipment: EquipmentLine[]
  supportRequired: boolean
  supportDetails: string
  placementDetails: string
  notRequired: boolean
  decisionReason?: string | null
}

const route = useRoute()
const eventRequestId = computed(() => String(route.params.id ?? ''))
const { user } = useUserSession()
const canEdit = computed(() => user.value?.role === 'EVENT_COORDINATOR')
const { data: typesData, error: typesError } = await useFetch<{ equipmentTypes: { id: string, name: string }[] }>('/api/technical-equipment-types')
const { data: existing, error: requestError, refresh } = await useFetch<TechnicalRequest | null>(
  () => `/api/events/${encodeURIComponent(eventRequestId.value)}/technical-request`,
  { default: () => null },
)
const requestNotFound = computed(() => Number((requestError.value as { statusCode?: number, status?: number } | null)?.statusCode ?? (requestError.value as { status?: number } | null)?.status) === 404)
const requestUnavailable = computed(() => Boolean(requestError.value && !requestNotFound.value))
const types = computed(() => typesData.value?.equipmentTypes ?? [])
const equipment = ref<Record<string, number>>({})
const selectedEquipment = computed(() => Object.entries(equipment.value)
  .filter(([, quantity]) => Number.isInteger(quantity) && quantity > 0)
  .map(([equipmentType, quantity]) => ({ equipmentType, quantity })))
const supportRequired = ref(false)
const supportDetails = ref('')
const placementDetails = ref('')
const notRequired = ref(false)
const saving = ref(false)
const pageReady = ref(false)
const errorMessage = ref('')
const fieldError = ref('')
const saved = ref(false)
onMounted(() => { pageReady.value = true })
const readOnly = computed(() => !canEdit.value || (existing.value?.coordinatorId && existing.value.coordinatorId !== user.value?.id))
const statusLabel = computed(() => ({ SUBMITTED: 'Pending Technical Support review', APPROVED: 'Approved', REJECTED: 'Rejected' }[existing.value?.status ?? 'SUBMITTED']))

watch(existing, (request) => {
  if (!request) return
  equipment.value = Object.fromEntries((Array.isArray(request.equipment) ? request.equipment : []).map(line => [line.equipmentType, line.quantity]))
  supportRequired.value = request.supportRequired
  supportDetails.value = request.supportDetails
  placementDetails.value = request.placementDetails
  notRequired.value = request.notRequired
}, { immediate: true })

function validate() {
  fieldError.value = ''
  const selected = Object.entries(equipment.value).filter(([, quantity]) => quantity > 0)
  if (selected.some(([, quantity]) => !Number.isInteger(quantity) || quantity < 1)) {
    fieldError.value = 'Equipment quantities must be whole numbers of at least 1.'
    return false
  }
  if (supportRequired.value && !supportDetails.value.trim()) {
    fieldError.value = 'Describe the requested support.'
    return false
  }
  if (!placementDetails.value.trim()) {
    fieldError.value = 'Describe the required placement or preparation.'
    return false
  }
  if (!selected.length && !supportRequired.value && !notRequired.value) {
    fieldError.value = 'Specify equipment or support, or mark requirements as not required.'
    return false
  }
  if (selected.length && notRequired.value) {
    fieldError.value = 'Equipment cannot be requested and marked not required.'
    return false
  }
  return true
}

function setEquipmentQuantity(equipmentType: string, event: Event) {
  const input = event.target as HTMLInputElement
  const quantity = input.value === '' ? 0 : Number(input.value)
  equipment.value = { ...equipment.value, [equipmentType]: quantity }
}

async function submit() {
  if (saving.value || readOnly.value || !validate()) return
  saving.value = true
  errorMessage.value = ''
  saved.value = false
  const body = {
    version: existing.value?.version ?? 1,
    equipment: Object.entries(equipment.value).filter(([, quantity]) => quantity > 0).map(([equipmentType, quantity]) => ({ equipmentType, quantity })),
    supportRequired: supportRequired.value,
    supportDetails: supportDetails.value,
    placementDetails: placementDetails.value,
    notRequired: notRequired.value,
  }
  try {
    const result = await useRequestFetch()<TechnicalRequest>(`/api/events/${encodeURIComponent(eventRequestId.value)}/technical-request`, {
      method: 'POST', body, headers: { 'Idempotency-Key': crypto.randomUUID() },
    })
    existing.value = result
    saved.value = true
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to save technical requirements. Please retry.'
    if (String(errorMessage.value).includes('409')) await refresh()
  }
  finally { saving.value = false }
}

useHead({ title: 'Technical requirements | ConnectSphere' })
</script>

<template>
  <main class="mx-auto w-full max-w-4xl px-5 py-8 md:px-8">
    <NuxtLink :to="`/requests/${eventRequestId}`" class="underline">Back to event request</NuxtLink>
    <h1 class="mt-4 text-3xl font-semibold">Technical requirements</h1>
    <p class="mt-2 text-muted-foreground">Specify equipment, support, and placement needs for this event.</p>

    <p v-if="requestUnavailable" role="alert" class="mt-5">Could not load technical requirements. Check access or try again.</p>
    <p v-else-if="typesError" role="alert" class="mt-5">Equipment types are unavailable right now.</p>
    <p v-if="existing" role="status" data-testid="technical-status" class="mt-5 rounded-lg border p-3">Status: {{ statusLabel }}</p>
    <p v-if="existing?.status === 'REJECTED' && existing.decisionReason" class="mt-2 rounded-lg bg-muted p-3">Technical Support feedback: {{ existing.decisionReason }}</p>

    <form v-if="!requestUnavailable && !typesError" class="mt-6 grid gap-6" @submit.prevent="submit">
      <fieldset class="grid gap-3" :disabled="readOnly || saving || !pageReady">
        <legend class="text-lg font-medium">Equipment</legend>
        <p v-if="!types.length" class="text-sm text-muted-foreground">No equipment types are configured.</p>
        <label v-for="item in types" :key="item.id" class="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-4 rounded-lg border p-3">
          <span>{{ item.name }}</span>
          <span class="grid min-w-0 gap-1 text-sm">Quantity
            <input :value="equipment[item.name] ?? ''" type="number" min="0" step="1" :aria-label="`${item.name} quantity`" class="w-full min-w-0 rounded border bg-background px-2 py-1" @input="setEquipmentQuantity(item.name, $event)" />
          </span>
        </label>
      </fieldset>
      <p v-if="selectedEquipment.length" data-testid="selected-equipment" class="text-sm text-muted-foreground">
        Selected equipment: {{ selectedEquipment.map(item => `${item.equipmentType} — ${item.quantity}`).join(', ') }}
      </p>

      <label class="flex items-center gap-3">
        <input v-model="supportRequired" type="checkbox" aria-label="Technical support is required" :disabled="readOnly || saving || !pageReady" />
        <span>Technical support is required</span>
      </label>
      <label v-if="supportRequired" class="grid gap-2">
        <span>Support details</span>
        <textarea v-model="supportDetails" aria-label="Support details" rows="3" :disabled="readOnly || saving || !pageReady" class="rounded-md border bg-background p-3" />
      </label>
      <label class="grid gap-2">
        <span>Placement and preparation details</span>
        <textarea v-model="placementDetails" aria-label="Placement and preparation details" rows="3" :disabled="readOnly || saving || !pageReady" class="rounded-md border bg-background p-3" />
      </label>
      <label class="flex items-center gap-3">
        <input v-model="notRequired" type="checkbox" aria-label="No technical requirements are needed" :disabled="readOnly || saving || !pageReady" />
        <span>No technical requirements are needed</span>
      </label>

      <p v-if="fieldError" role="alert" class="text-destructive">{{ fieldError }}</p>
      <p v-if="errorMessage" role="alert" class="text-destructive">{{ errorMessage }}</p>
      <p v-if="saved" role="status">Submitted for Technical Support review</p>
      <button v-if="!readOnly" type="submit" :disabled="saving || !pageReady" class="w-fit rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{{ saving ? 'Saving…' : existing ? 'Update requirements' : 'Submit requirements' }}</button>
      <p v-else class="text-sm text-muted-foreground">These requirements are read-only for your account.</p>
    </form>
  </main>
</template>
