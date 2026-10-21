<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type EquipmentAllocation = { venueId: string, quantity: number }
type EquipmentLine = { equipmentType: string, quantity: number, venueAllocations: EquipmentAllocation[] }
type TechnicalRequest = {
  eventRequestId: string
  coordinatorId?: string
  version: number
  status: 'PENDING_TECH_REVIEW' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'NOT_REQUIRED'
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
const { data: typesData, error: typesError } = await useFetch<{ equipmentTypes: { id: string, name: string, total?: number, version?: number }[] }>('/api/technical-equipment-types')
const { data: existing, error: requestError, refresh } = await useFetch<TechnicalRequest | null>(
  () => `/api/events/${encodeURIComponent(eventRequestId.value)}/technical-request`,
  { default: () => null },
)
const requestNotFound = computed(() => Number((requestError.value as { statusCode?: number, status?: number } | null)?.statusCode ?? (requestError.value as { status?: number } | null)?.status) === 404)
const requestUnavailable = computed(() => Boolean(requestError.value && !requestNotFound.value))
const types = computed(() => typesData.value?.equipmentTypes ?? [])

type Venue = { id: string, name: string }
type Row = { equipmentType: string, quantity: number | string, venueId: string }
const rows = ref<Row[]>([])
function emptyRow(): Row { return { equipmentType: '', quantity: 0, venueId: '' } }
const { data: venuesData, error: venuesError } = await useFetch<any>('/api/venues')
const venues = computed(() => {
  const value = venuesData.value
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.items)) return value.items
  if (Array.isArray(value?.venues)) return value.venues
  if (Array.isArray(value?.data)) return value.data
  return []
})
const saving = ref(false)
const pageReady = ref(false)
const errorMessage = ref('')
const fieldError = ref('')
const saved = ref(false)
onMounted(() => { pageReady.value = true })
const readOnly = computed(() => !canEdit.value || (existing.value?.coordinatorId && existing.value.coordinatorId !== user.value?.id))
const statusLabel = computed(() => ({ PENDING_TECH_REVIEW: 'Pending Technical Support review', SUBMITTED: 'Pending Technical Support review', APPROVED: 'Approved', REJECTED: 'Rejected', NOT_REQUIRED: 'No technical requirements' }[existing.value?.status ?? 'PENDING_TECH_REVIEW']))

watch(existing, (request) => {
  if (!request) {
    rows.value = [emptyRow()]
    return
  }
  const equipment = Array.isArray(request.equipment) ? request.equipment : []
  rows.value = equipment.length
    ? equipment.map(line => ({
        equipmentType: line.equipmentType,
        quantity: line.quantity,
        venueId: (line as any).venueId ?? '',
      }))
    : [emptyRow()]
}, { immediate: true })

const supportRequired = ref(false)
const supportDetailsRef = ref('')
const placementDetails = ref('')
const notRequired = ref(false)

watch(existing, (request) => {
  if (!request) return
  supportRequired.value = request.supportRequired
  supportDetailsRef.value = request.supportDetails
  placementDetails.value = request.placementDetails
  notRequired.value = request.notRequired
}, { immediate: true })

function addRow() {
  rows.value = [...rows.value, emptyRow()]
}

function removeRow(index: number) {
  rows.value.splice(index, 1)
  if (rows.value.length === 0) rows.value = [emptyRow()]
}

function validate() {
  fieldError.value = ''
  const selected = rows.value.filter(row => Number(row.quantity) > 0)
  for (const row of selected) {
    const quantity = Number(row.quantity)
    if (!Number.isInteger(quantity) || quantity < 1) {
      fieldError.value = 'Equipment quantities must be whole numbers of at least 1.'
      return false
    }
    const total = types.value.find(item => item.name === row.equipmentType)?.total
    if (typeof total === 'number' && quantity > total) {
      fieldError.value = `Requested ${row.equipmentType} quantity exceeds physical inventory.`
      return false
    }
    if (!row.venueId) {
      fieldError.value = `Select a venue for ${row.equipmentType || 'equipment'}.`
      return false
    }
  }
  if (supportRequired.value && !supportDetailsRef.value.trim()) {
    fieldError.value = 'Describe the requested support.'
    return false
  }
  if (supportDetailsRef.value.length > 1000) {
    fieldError.value = 'Support details must be at most 1000 characters.'
    return false
  }
  if (!placementDetails.value.trim()) {
    fieldError.value = 'Describe the required placement or preparation.'
    return false
  }
  if (placementDetails.value.length > 500) {
    fieldError.value = 'Placement details must be at most 500 characters.'
    return false
  }
  if (selected.length === 0 && !supportRequired.value && !notRequired.value) {
    fieldError.value = 'Specify equipment or support, or mark requirements as not required.'
    return false
  }
  if (selected.length > 0 && notRequired.value) {
    fieldError.value = 'Equipment cannot be requested and marked not required.'
    return false
  }
  return true
}

async function submit() {
  if (saving.value || readOnly.value || !validate()) return
  saving.value = true
  errorMessage.value = ''
  saved.value = false
  const equipment = rows.value
    .filter(row => Number(row.quantity) > 0)
    .map(row => ({
      equipmentType: row.equipmentType,
      quantity: Number(row.quantity),
      venueId: row.venueId,
    }))
  const body = {
    version: existing.value?.version ?? 1,
    equipment,
    supportRequired: supportRequired.value,
    supportDetails: supportDetailsRef.value,
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
  <main class="mx-auto flex w-full max-w-4xl flex-col gap-8 px-5 py-8 md:px-8">
    <div class="flex flex-col gap-2">
      <Button as-child variant="ghost" size="sm" class="w-fit px-0">
        <NuxtLink :to="`/requests/${eventRequestId}`">← Back to event request</NuxtLink>
      </Button>
      <div class="flex flex-col gap-1">
        <h1 class="text-3xl font-semibold">Technical requirements</h1>
        <p class="text-sm text-muted-foreground">Specify equipment, support, and placement needs for this event.</p>
      </div>
    <p v-if="venuesError" class="text-xs text-destructive">Venues could not be loaded.</p>
    </div>

    <p v-if="requestUnavailable" role="alert" class="text-destructive">Could not load technical requirements. Check access or try again.</p>
    <p v-else-if="typesError" role="alert" class="text-destructive">Equipment types are unavailable right now.</p>

    <Card v-if="existing">
      <CardHeader>
        <CardTitle>Status</CardTitle>
      </CardHeader>
      <CardContent class="flex flex-col gap-2">
        <p role="status" data-testid="technical-status" class="rounded-lg border p-3">Status: {{ statusLabel }}</p>
        <p v-if="existing.status === 'REJECTED' && existing.decisionReason" class="rounded-lg bg-muted p-3">Technical Support feedback: {{ existing.decisionReason }}</p>
      </CardContent>
    </Card>

    <form v-if="!requestUnavailable && !typesError" class="flex flex-col gap-6" @submit.prevent="submit">
      <Card>
        <CardHeader>
          <CardTitle>Equipment</CardTitle>
          <p class="text-sm text-muted-foreground">One pooled request for the whole event; split the quantity across venues below.</p>
        </CardHeader>
        <CardContent class="flex flex-col gap-4">
          <div class="overflow-x-auto rounded-lg border">
            <table class="w-full text-sm">
              <thead class="bg-muted">
                <tr>
                  <th class="px-3 py-2 text-left">Equipment type</th>
                  <th class="px-3 py-2 text-left">Quantity</th>
                  <th class="px-3 py-2 text-left">Placement by venue</th>
                  <th class="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in rows" :key="index" class="border-t">
                  <td class="px-3 py-2">
                    <Select v-model="row.equipmentType">
                      <SelectTrigger aria-label="Equipment type">
                        <SelectValue placeholder="Select equipment" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="item in types" :key="item.id" :value="item.name">{{ item.name }}</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td class="px-3 py-2">
                    <Input v-model.number="row.quantity" type="number" min="0" :aria-label="`${row.equipmentType || 'equipment'} quantity`" />
                  </td>
                  <td class="px-3 py-2">
                    <Select v-model="row.venueId">
                      <SelectTrigger aria-label="Venue">
                        <SelectValue placeholder="Select venue" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="venue in venues" :key="venue.id" :value="venue.id">{{ venue.name || venue.id }}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p v-if="venues.length === 0" class="text-xs text-muted-foreground">No venues available.</p>
                  </td>
                  <td class="px-3 py-2">
                    <Button type="button" variant="ghost" size="sm" @click="removeRow(index)">Remove</Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <Button type="button" variant="outline" size="sm" class="w-fit" @click="addRow">+ Add equipment line</Button>
          <p v-if="rows.some(row => Number(row.quantity) > 0)" data-testid="selected-equipment" class="text-sm text-muted-foreground">
            Selected equipment: {{ rows.filter(row => Number(row.quantity) > 0).map(row => `${row.equipmentType} — ${Number(row.quantity)}`).join(', ') }}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Support & placement</CardTitle>
        </CardHeader>
        <CardContent class="flex flex-col gap-4">
          <label class="flex items-center gap-3">
            <Checkbox v-model="notRequired" />
            <span>No equipment or technical support required for this event</span>
          </label>
          <label class="flex items-center gap-3">
            <Checkbox v-model="supportRequired" />
            <span>Technical support is required</span>
          </label>
          <div v-if="supportRequired" class="flex flex-col gap-2">
            <label for="support-details" class="text-sm font-medium">Technical support needed</label>
            <Textarea id="support-details" v-model="supportDetailsRef" maxlength="1000" />
          </div>
          <div class="flex flex-col gap-2">
            <label for="placement-details" class="text-sm font-medium">Placement notes</label>
            <Textarea id="placement-details" v-model="placementDetails" maxlength="500" />
          </div>
        </CardContent>
      </Card>

      <p v-if="fieldError" role="alert" class="text-destructive">{{ fieldError }}</p>
      <p v-if="errorMessage" role="alert" class="text-destructive">{{ errorMessage }}</p>
      <p v-if="saved && existing?.status !== 'NOT_REQUIRED'" role="status">Submitted for Technical Support review</p>
      <p v-else-if="saved" role="status">No technical requirements declaration recorded</p>

      <div class="flex gap-2">
        <Button as-child variant="outline">
          <NuxtLink :to="`/requests/${eventRequestId}`">Cancel</NuxtLink>
        </Button>
        <Button v-if="!readOnly" type="submit" :disabled="saving || !pageReady">
          {{ saving ? 'Saving…' : existing ? 'Update requirements' : 'Submit requirements' }}
        </Button>
      </div>
      <p v-if="readOnly" class="text-sm text-muted-foreground">These requirements are read-only for your account.</p>
    </form>
  </main>
</template>
