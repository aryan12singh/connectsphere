<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { apiErrorMessage } from '@/components/shared/api-error'

// CS-30: a Coordinator cannot hand a request to another Coordinator. They ask the
// Lead, with a reason, and stay responsible until the Lead reassigns it. The Lead
// can also decline, and the reason is shown here.
const props = defineProps<{ requestId: string, version: number }>()
const emit = defineEmits<{ changed: [] }>()
interface Transfer { id: string, reason: string, status: string, createdAt: string | null, decisionReason: string | null }
const requestFetch = useRequestFetch()
const items = ref<Transfer[]>([])
const reason = ref(''), pending = ref(false), error = ref(''), notice = ref(''), loaded = ref(false)
const actionId = ref(crypto.randomUUID())
const open = computed(() => items.value.find(item => item.status === 'PENDING') ?? null)
const declined = computed(() => (items.value[0]?.status === 'DECLINED' ? items.value[0] : null))
async function load() {
  try {
    const result = await requestFetch<{ items?: Transfer[] }>(`/api/events/${props.requestId}/transfer-request`)
    items.value = Array.isArray(result?.items) ? result.items : []
  }
  catch { items.value = [] }
  finally { loaded.value = true }
}
async function ask() {
  if (pending.value || !reason.value.trim()) return
  pending.value = true; error.value = ''; notice.value = ''
  try {
    await requestFetch(`/api/events/${props.requestId}/transfer-request`, { method: 'POST', body: { transferActionId: actionId.value, reason: reason.value, version: props.version } })
    notice.value = 'The Lead has been asked to reassign this request. You stay responsible until they do.'
    reason.value = ''; actionId.value = crypto.randomUUID()
    await load(); emit('changed')
  }
  catch (e) { error.value = apiErrorMessage(e, 'Could not send the request. Refresh and try again.') }
  finally { pending.value = false }
}
async function withdraw() {
  const current = open.value
  if (pending.value || !current) return
  pending.value = true; error.value = ''; notice.value = ''
  try {
    await requestFetch(`/api/events/${props.requestId}/transfer-request/${current.id}/withdraw`, { method: 'POST' })
    notice.value = 'Your request was withdrawn.'
    await load(); emit('changed')
  }
  catch (e) { error.value = apiErrorMessage(e, 'Could not withdraw the request. Refresh and try again.') }
  finally { pending.value = false }
}
onMounted(load)
</script>
<template>
  <section aria-label="Ask the Lead to reassign" class="grid gap-3 rounded-xl border p-4" data-testid="transfer-panel">
    <h2 class="text-base font-semibold">Can't continue with this request?</h2>
    <template v-if="open">
      <p class="text-sm" data-testid="transfer-pending">You asked the Lead to reassign this request. Reason: “{{ open.reason }}”. You stay the Coordinator until the Lead chooses someone else.</p>
      <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
      <div><Button type="button" variant="outline" size="sm" data-testid="transfer-withdraw" :disabled="pending" @click="withdraw">{{ pending ? 'Working…' : 'Withdraw request' }}</Button></div>
    </template>
    <template v-else-if="loaded">
      <p class="text-sm text-muted-foreground">You cannot hand this request to another Coordinator yourself. Ask the Lead to reassign it. You stay responsible until they do.</p>
      <p v-if="declined" role="status" class="text-sm" data-testid="transfer-declined">The Lead declined your last request: “{{ declined.decisionReason }}”. The request stays with you.</p>
      <form class="grid gap-3" novalidate @submit.prevent="ask">
        <label class="grid gap-1 text-sm">Reason
          <textarea v-model="reason" aria-label="Reason for asking the Lead to reassign" rows="3" maxlength="500" class="rounded-xl border border-border bg-background px-3 py-2" />
        </label>
        <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
        <div><Button type="submit" variant="outline" data-testid="transfer-ask" :disabled="pending || !reason.trim()">{{ pending ? 'Sending…' : 'Ask the Lead to reassign' }}</Button></div>
      </form>
    </template>
    <p v-if="notice" role="status" class="text-sm text-success" data-testid="transfer-notice">{{ notice }}</p>
  </section>
</template>
