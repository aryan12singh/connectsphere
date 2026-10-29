<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { apiErrorMessage } from '@/components/shared/api-error'

// CS-45: propose a significant change, and (for the assigned Coordinator) decide it.
// Current values stay in force until a proposal is approved.
const props = defineProps<{ requestId: string, version: number, isCoordinator: boolean, isOrganiser: boolean }>()
const emit = defineEmits<{ decided: [] }>()
const requestFetch = useRequestFetch()
type Proposal = { id: string, scope: string, affected: string[], fields: Record<string, unknown>, previous: Record<string, unknown>, reason: string, status: string, decisionReason?: string | null, proposedByRole: string }
const FIELD_LABELS: Record<string, string> = { eventName: 'Event name', description: 'Description', proposedDate: 'Date', startTime: 'Start time', endDate: 'End date', endTime: 'End time', expectedAttendance: 'Expected attendance', minimumCapacity: 'Minimum capacity', venueType: 'Venue type', startAt: 'Start', endAt: 'End' }
const SCOPE_LABELS: Record<string, string> = { EVENT: 'Whole Event', BOOKING: 'Specific venue booking(s)', TECHNICAL: 'Technical request', CANCELLATION: 'Cancel the Event' }
const SCOPES = { EVENT: SCOPE_LABELS.EVENT, BOOKING: SCOPE_LABELS.BOOKING, TECHNICAL: SCOPE_LABELS.TECHNICAL } as Record<string, string>
const proposals = ref<Proposal[]>([]), loadError = ref(''), pending = ref(false), error = ref(''), notice = ref('')
const form = reactive({ scope: 'EVENT', affected: '', reason: '', eventName: '', description: '', proposedDate: '', startTime: '', endTime: '', expectedAttendance: '', minimumCapacity: '', venueType: '' })
const decisionReason = reactive<Record<string, string>>({})
const open = computed(() => proposals.value.find(p => p.status === 'PENDING'))
const canPropose = computed(() => (props.isCoordinator || props.isOrganiser) && !open.value)
async function load() {
  try { proposals.value = (await requestFetch(`/api/events/${props.requestId}/change-requests`) as { items: Proposal[] }).items; loadError.value = '' }
  catch (e) { loadError.value = apiErrorMessage(e, 'Could not load change proposals.') }
}
onMounted(load)
function fieldsFromForm() {
  const out: Record<string, unknown> = {}
  for (const k of ['eventName', 'description', 'proposedDate', 'startTime', 'endTime', 'venueType'] as const) if (form[k].trim()) out[k] = form[k].trim()
  for (const k of ['expectedAttendance', 'minimumCapacity'] as const) if (form[k].trim()) out[k] = Number(form[k])
  return out
}
const hasFields = computed(() => Object.keys(fieldsFromForm()).length > 0)
async function propose() {
  if (pending.value || !hasFields.value || !form.reason.trim()) return
  pending.value = true; error.value = ''; notice.value = ''
  try {
    await requestFetch(`/api/events/${props.requestId}/change-requests`, { method: 'POST', body: {
      changeActionId: crypto.randomUUID(), scope: form.scope, reason: form.reason, version: props.version, fields: fieldsFromForm(),
      affected: form.scope === 'EVENT' ? [] : form.affected.split(',').map(s => s.trim()).filter(Boolean) } })
    notice.value = 'Change proposed. Current arrangements stay in place until it is decided.'
    Object.assign(form, { affected: '', reason: '', eventName: '', description: '', proposedDate: '', startTime: '', endTime: '', expectedAttendance: '', minimumCapacity: '', venueType: '' })
    await load()
  } catch (e) { error.value = apiErrorMessage(e, 'Could not propose the change.') }
  finally { pending.value = false }
}
async function decide(p: Proposal, decision: 'approve' | 'reject') {
  if (pending.value) return
  pending.value = true; error.value = ''; notice.value = ''
  try {
    await requestFetch(`/api/events/${props.requestId}/change-requests/${p.id}/decision`, { method: 'POST', body: { decision, reason: decisionReason[p.id] ?? '' } })
    notice.value = decision === 'approve' ? 'Change approved. Affected arrangements need re-review.' : 'Change rejected. Nothing was changed.'
    await load(); emit('decided')
  } catch (e) { error.value = apiErrorMessage(e, 'Could not record the decision.') }
  finally { pending.value = false }
}
const show = (v: unknown) => v === null || v === undefined || v === '' ? '—' : String(v)
</script>
<template>
  <section aria-label="Change proposals" class="grid gap-4 rounded-xl border p-4">
    <h2 class="text-base font-semibold">Propose a change</h2>
    <p class="text-sm text-muted-foreground">Use this for dates, venue, capacity or other significant changes. Current arrangements stay in place until the Coordinator approves.</p>
    <p v-if="loadError" role="alert" class="text-sm text-destructive">{{ loadError }}</p>

    <ul v-if="proposals.length" class="grid gap-3">
      <li v-for="p in proposals" :key="p.id" class="grid gap-2 rounded-lg border p-3 text-sm">
        <div class="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{{ p.status === 'PENDING' ? 'Waiting for decision' : p.status === 'APPROVED' ? 'Approved' : 'Rejected' }}</Badge>
          <span>{{ SCOPE_LABELS[p.scope] ?? p.scope }}<template v-if="p.affected.length"> · {{ p.affected.join(', ') }}</template></span>
        </div>
        <table v-if="Object.keys(p.fields).length" class="w-full text-left"><thead><tr><th class="pr-3 font-medium">Field</th><th class="pr-3 font-medium">Before</th><th class="font-medium">After</th></tr></thead>
          <tbody><tr v-for="(value, key) in p.fields" :key="key"><td class="pr-3">{{ FIELD_LABELS[key as string] ?? key }}</td><td class="pr-3 text-muted-foreground">{{ show(p.previous[key]) }}</td><td>{{ show(value) }}</td></tr></tbody></table>
        <p>Reason: {{ p.reason }}</p>
        <p v-if="p.decisionReason">Decision note: {{ p.decisionReason }}</p>
        <div v-if="p.status === 'PENDING' && isCoordinator" class="grid gap-2">
          <label class="grid gap-1">Decision note (required to reject)<textarea v-model="decisionReason[p.id]" rows="2" maxlength="500" class="rounded-xl border border-border bg-background px-3 py-2" /></label>
          <div class="flex gap-2">
            <Button size="sm" :disabled="pending" @click="decide(p, 'approve')">Approve change</Button>
            <Button size="sm" variant="outline" :disabled="pending || !(decisionReason[p.id] ?? '').trim()" @click="decide(p, 'reject')">Reject change</Button>
          </div>
        </div>
      </li>
    </ul>

    <form v-if="canPropose" aria-label="Propose a change" class="grid gap-3" novalidate @submit.prevent="propose">
      <label class="grid gap-1 text-sm">What does it affect?
        <select v-model="form.scope" aria-label="Scope" class="rounded-xl border border-border bg-background px-3 py-2"><option v-for="(label, key) in SCOPES" :key="key" :value="key">{{ label }}</option></select></label>
      <label v-if="form.scope !== 'EVENT'" class="grid gap-1 text-sm">Booking or technical request IDs (comma separated)
        <input v-model="form.affected" aria-label="Affected IDs" class="rounded-xl border border-border bg-background px-3 py-2"></label>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="grid gap-1 text-sm">New event name<input v-model="form.eventName" aria-label="New event name" maxlength="100" class="rounded-xl border border-border bg-background px-3 py-2"></label>
        <label class="grid gap-1 text-sm">New venue type<input v-model="form.venueType" aria-label="New venue type" class="rounded-xl border border-border bg-background px-3 py-2"></label>
        <label class="grid gap-1 text-sm">New date<input v-model="form.proposedDate" aria-label="New date" type="date" class="rounded-xl border border-border bg-background px-3 py-2"></label>
        <label class="grid gap-1 text-sm">New start time<input v-model="form.startTime" aria-label="New start time" type="time" class="rounded-xl border border-border bg-background px-3 py-2"></label>
        <label class="grid gap-1 text-sm">New end time<input v-model="form.endTime" aria-label="New end time" type="time" class="rounded-xl border border-border bg-background px-3 py-2"></label>
        <label class="grid gap-1 text-sm">New expected attendance<input v-model="form.expectedAttendance" aria-label="New expected attendance" type="number" min="1" class="rounded-xl border border-border bg-background px-3 py-2"></label>
        <label class="grid gap-1 text-sm">New minimum capacity<input v-model="form.minimumCapacity" aria-label="New minimum capacity" type="number" min="1" class="rounded-xl border border-border bg-background px-3 py-2"></label>
      </div>
      <label class="grid gap-1 text-sm">New description<textarea v-model="form.description" aria-label="New description" rows="3" class="rounded-xl border border-border bg-background px-3 py-2" /></label>
      <label class="grid gap-1 text-sm">Reason for the change<textarea v-model="form.reason" aria-label="Reason for the change" rows="2" maxlength="500" class="rounded-xl border border-border bg-background px-3 py-2" /></label>
      <div><Button type="submit" :disabled="pending || !hasFields || !form.reason.trim()">{{ pending ? 'Sending…' : 'Propose change' }}</Button></div>
    </form>
    <p v-else-if="open && !isCoordinator" class="text-sm text-muted-foreground">A change is waiting for the Coordinator's decision.</p>
    <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
    <p v-if="notice" role="status" class="text-sm text-success">{{ notice }}</p>
  </section>
</template>
