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
  unknownNeeds?: string[]
  sourceNeeds?: string[]
  sourceTechnicalDetails?: string
  eventStatus?: string
  notRequired: boolean
}

const { data, error, refresh } = await useFetch<{ requests: RequestItem[] }>('/api/technical-requests')
const {data:inventory,refresh:refreshInventory}=await useFetch<{items:{equipmentType:string,total:number,version:number}[]}>('/api/equipment/inventory')
const totals=ref<Record<string,number>>({})
const requests = computed(() => data.value?.requests ?? [])
const selectedId = ref('')
const selected = computed(() => requests.value.find(request => request.eventRequestId === selectedId.value) ?? requests.value[0] ?? null)
const reason = ref('')
const resolutionModes=ref<Record<string,string>>({}),resolutionTypes=ref<Record<string,string>>({}),resolutionNotes=ref<Record<string,string>>({})
const actionError = ref('')
const saving = ref(false)
const actionResult = ref('')
const pageReady = ref(false)
onMounted(() => { pageReady.value = true })

async function reserve(){
 if(!selected.value||saving.value)return
 saving.value=true;actionError.value='';actionResult.value=''
 try{await $fetch(`/api/equipment/requests/${encodeURIComponent(selected.value.eventRequestId)}/reserve`,{method:'POST',body:{version:selected.value.version,...(['CANCELLED','COMPLETED','REJECTED'].includes(selected.value.eventStatus||'')?{release:true}:{})},headers:{'idempotency-key':crypto.randomUUID()}});actionResult.value='Complete current equipment reservation saved.';await refresh()}
 catch(error:any){actionError.value=error?.data?.data?.error?.message||error?.data?.error?.message||'Unable to reserve all equipment. Check stock and current requirements.'}
 finally{saving.value=false}
}
async function saveStock(row:{equipmentType:string,total:number,version:number}){
 if(saving.value || !pageReady.value)return;saving.value=true;actionError.value=''
 try{await $fetch('/api/equipment/inventory/'+encodeURIComponent(row.equipmentType),{method:'PUT',body:{version:row.version,total:Number(totals.value[row.equipmentType]??row.total)},headers:{'idempotency-key':crypto.randomUUID()}});await refreshInventory();actionResult.value='Inventory updated.'}
 catch(error:any){actionError.value=error?.data?.data?.error?.message||error?.data?.error?.message||'Unable to update inventory.'}
 finally{saving.value=false}
}
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
      body: { decision, reason: note, version: selected.value.version,coverageResolution:(selected.value.unknownNeeds||[]).map(need=>({need,mode:resolutionModes.value[need]||'EQUIPMENT',equipmentTypes:(resolutionTypes.value[need]||'').split(',').map(s=>s.trim()).filter(Boolean),note:resolutionNotes.value[need]||''})) },
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
    <details v-if="inventory" class="mt-5 rounded-xl border p-4"><summary class="cursor-pointer font-medium">Equipment inventory</summary><p class="my-3 text-sm text-muted-foreground">Stock is shared across overlapping Events. Reductions cannot undercut existing reservations.</p><form v-for="row in inventory.items" :key="row.equipmentType" class="my-2 flex flex-wrap items-center gap-3" @submit.prevent="saveStock(row)"><label class="flex items-center gap-3"><span>{{ row.equipmentType }}</span><input :value="totals[row.equipmentType] ?? row.total" type="number" :disabled="saving || !pageReady" min="0" max="1000000" step="1" class="w-28 rounded-md border bg-background p-2" :aria-label="row.equipmentType+' total stock'" @input="totals[row.equipmentType]=Number(($event.target as HTMLInputElement).value)" /></label><button :disabled="saving || !pageReady" class="rounded-md border px-3 py-2">Save stock</button></form></details>
    <p v-if="actionResult" role="status" class="mt-5">{{ actionResult }}</p>
    <p v-if="error" role="alert" class="mt-5">The technical review queue is unavailable.</p>
    <p v-else-if="requests.length === 0" role="status" class="mt-5">No technical requests are awaiting review.</p>
    <div v-else class="mt-6 grid items-start gap-6 md:grid-cols-[minmax(16rem,1fr)_2fr]">
      <nav aria-label="Pending technical requests" class="grid gap-2">
        <button v-for="request in requests" :key="request.eventRequestId" type="button" :disabled="!pageReady" :aria-current="selected?.eventRequestId === request.eventRequestId ? 'true' : undefined" class="rounded-lg border p-3 text-left disabled:opacity-50" @click="selectedId = request.eventRequestId; reason = ''; actionError = ''">
          <span class="block font-medium">Event request {{ request.eventRequestId }}</span>
          <span class="text-sm text-muted-foreground">Version {{ request.version }} · {{ request.status.toLowerCase() }}</span>
        </button>
      </nav>
      <section v-if="selected" aria-label="Selected technical request" class="grid gap-5 rounded-xl border p-5">
        <h2 class="text-xl font-semibold">Requirements for {{ selected.eventRequestId }}</h2>
        <p>Status: {{ selected.status.toLowerCase() }}</p><p v-if="selected.sourceNeeds?.length" class="text-sm"><strong>Current Event needs:</strong> {{ selected.sourceNeeds.join(', ') }}</p><p v-if="selected.sourceTechnicalDetails" class="whitespace-pre-wrap text-sm">{{ selected.sourceTechnicalDetails }}</p><fieldset v-for="need in selected.unknownNeeds" :key="need" :disabled="saving || !pageReady" class="grid gap-3 rounded-xl border p-4"><legend class="px-2 font-medium">Resolve: {{ need }}</legend><label class="grid gap-1 text-sm">Classification<select v-model="resolutionModes[need]" class="rounded-md border bg-background p-2"><option value="EQUIPMENT">Known inventory equipment required</option><option value="SUPPORT_ONLY">Support only; no portable equipment needed</option></select></label><label v-if="resolutionModes[need]!=='SUPPORT_ONLY'" class="grid gap-1 text-sm">Inventory types (comma separated)<input v-model="resolutionTypes[need]" placeholder="e.g. projector, microphone" class="rounded-md border bg-background p-2" /></label><label class="grid gap-1 text-sm">Resolution and evidence note<textarea v-model="resolutionNotes[need]" minlength="10" maxlength="2000" class="rounded-md border bg-background p-2" placeholder="Explain how this specific need is covered. Equipment must be in the submitted requirements and reserved before Safety." /></label></fieldset>
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
        <button v-if="selected.status==='APPROVED'" type="button" :disabled="saving || !pageReady" class="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" @click="reserve">{{ ['CANCELLED','REJECTED','COMPLETED'].includes(selected.eventStatus||'') ? 'Release equipment for closed Event' : selected.equipment.length ? 'Reserve all requested equipment' : 'Release superseded equipment reservations' }}</button>
        <div v-if="selected.status==='SUBMITTED'" class="flex flex-wrap gap-3">
          <button type="button" :disabled="saving || !pageReady" class="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" @click="decide('APPROVED')">Approve</button>
          <button type="button" :disabled="saving || !pageReady" class="rounded-md border px-4 py-2 disabled:opacity-50" @click="decide('REJECTED')">Reject</button>
        </div>
      </section>
    </div>
  </main>
</template>
