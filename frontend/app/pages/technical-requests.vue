<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

type RequestItem = {
  eventRequestId: string
  coordinatorId: string
  version: number
  status: string
  equipment: { equipmentType: string, quantity: number }[]
  supportRequired: boolean
  supportDetails: string
  placementDetails: string
  notRequired: boolean
}

const { data, error, refresh } = await useFetch<{ requests: RequestItem[] }>('/api/technical-requests')
const requests = computed(() => data.value?.requests ?? [])
const selectedId = ref('')
const selected = computed(() => requests.value.find(request => request.eventRequestId === selectedId.value) ?? requests.value[0] ?? null)
const reason = ref('')
const actionError = ref('')
const saving = ref(false)
const actionResult = ref('')
const pageReady = ref(false)
onMounted(() => { pageReady.value = true })

async function decide(decision: 'APPROVED' | 'REJECTED') {
  if (!selected.value || saving.value) return
  const note = reason.value.trim()
  if (decision === 'REJECTED' && !note) {
    actionError.value = 'A reason is required to reject this request.'
    return
  }
  saving.value = true
  actionError.value = ''
  actionResult.value = ''
  try {
    await useRequestFetch()<RequestItem>(`/api/events/${encodeURIComponent(selected.value.eventRequestId)}/technical-request/decision`, {
      method: 'POST',
      body: { decision, reason: note, version: selected.value.version },
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    })
    actionResult.value = decision === 'APPROVED' ? 'Technical requirements approved.' : 'Technical requirements rejected.'
    reason.value = ''
    await refresh()
  }
  catch (error) {
    actionError.value = error instanceof Error ? error.message : 'Unable to save the decision. Please retry.'
  }
  finally { saving.value = false }
}

useHead({ title: 'Technical requirements review | ConnectSphere' })
</script>

<template>
  <main class="mx-auto w-full max-w-6xl px-5 py-8 md:px-8">
    <h1 class="text-3xl font-semibold">Technical requirements review</h1>
    <p class="mt-2 text-muted-foreground">Review equipment and support requests submitted by Event Coordinators.</p>
    <p v-if="actionResult" role="status" class="mt-5">{{ actionResult }}</p>
    <p v-if="error" role="alert" class="mt-5">The technical review queue is unavailable.</p>
    <p v-else-if="requests.length === 0" role="status" class="mt-5">No technical requests are awaiting review.</p>
    <div v-else class="mt-6 grid items-start gap-6 md:grid-cols-[minmax(16rem,1fr)_2fr]">
      <nav aria-label="Pending technical requests" class="grid gap-2">
        <button v-for="request in requests" :key="request.eventRequestId" type="button" :disabled="!pageReady" :aria-current="selected?.eventRequestId === request.eventRequestId ? 'true' : undefined" class="rounded-lg border p-3 text-left disabled:opacity-50" @click="selectedId = request.eventRequestId; reason = ''; actionError = ''">
          <span class="block font-medium">Event request {{ request.eventRequestId }}</span>
          <span class="text-sm text-muted-foreground">Version {{ request.version }} · Pending</span>
        </button>
      </nav>
      <section v-if="selected" aria-label="Selected technical request" class="grid gap-5 rounded-xl border p-5">
        <h2 class="text-xl font-semibold">Requirements for {{ selected.eventRequestId }}</h2>
        <p>Status: Pending Technical Support review</p>
        <div>
          <h3 class="font-medium">Equipment</h3>
          <ul v-if="selected.equipment.length" class="list-disc pl-6">
            <li v-for="item in selected.equipment" :key="item.equipmentType">{{ item.equipmentType }} — {{ item.quantity }}</li>
          </ul>
          <p v-else>None requested</p>
        </div>
        <p><strong>Technical support:</strong> {{ selected.supportRequired ? selected.supportDetails : 'Not required' }}</p>
        <p><strong>Placement and preparation:</strong> {{ selected.placementDetails }}</p>
        <label class="grid gap-2">
          <span>Decision note (required when rejecting)</span>
          <textarea v-model="reason" aria-label="Decision note" rows="3" class="rounded-md border bg-background p-3" :disabled="saving || !pageReady" />
        </label>
        <p v-if="actionError" role="alert" class="text-destructive">{{ actionError }}</p>
        <div class="flex flex-wrap gap-3">
          <button type="button" :disabled="saving || !pageReady" class="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" @click="decide('APPROVED')">Approve</button>
          <button type="button" :disabled="saving || !pageReady" class="rounded-md border px-4 py-2 disabled:opacity-50" @click="decide('REJECTED')">Reject</button>
        </div>
      </section>
    </div>
  </main>
</template>
