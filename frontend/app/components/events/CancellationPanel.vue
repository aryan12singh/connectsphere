<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { apiErrorMessage } from '@/components/shared/api-error'

// CS-54: the assigned Coordinator cancels an Event with a reason; the owning
// Organiser can ask for cancellation. Releases happen afterwards and the Event
// shows Cancelling until every release succeeds.
const props = defineProps<{ requestId: string, eventStatus: string | null, isCoordinator: boolean, isOrganiser: boolean, pendingRequest: boolean }>()
const emit = defineEmits<{ done: [] }>()
const requestFetch = useRequestFetch()
const reason = ref(''), confirmed = ref(false), pending = ref(false), error = ref(''), notice = ref('')
const actionId = ref(crypto.randomUUID())
const cancelling = computed(() => props.eventStatus === 'CANCELLING')
const cancelled = computed(() => props.eventStatus === 'CANCELLED')
const open = computed(() => ['ARRANGEMENT_PENDING', 'CONFIRMED', 'PREPARATION'].includes(props.eventStatus ?? ''))
async function submit() {
  if (pending.value || !reason.value.trim()) return
  pending.value = true; error.value = ''; notice.value = ''
  try {
    if (props.isCoordinator) {
      await requestFetch(`/api/events/${props.requestId}/cancel`, { method: 'POST', body: { cancellationActionId: actionId.value, reason: reason.value } })
      notice.value = 'Cancellation started. The Event shows Cancelling until every release is complete.'
    } else {
      await requestFetch(`/api/events/${props.requestId}/change-requests`, { method: 'POST', body: { changeActionId: actionId.value, scope: 'CANCELLATION', reason: reason.value } })
      notice.value = 'Cancellation requested. The Coordinator will decide.'
    }
    reason.value = ''; confirmed.value = false; actionId.value = crypto.randomUUID()
    emit('done')
  } catch (e) { error.value = apiErrorMessage(e, 'Could not cancel. Refresh and try again.') }
  finally { pending.value = false }
}
</script>
<template>
  <section aria-label="Cancel Event" class="grid gap-3 rounded-xl border p-4">
    <h2 class="text-base font-semibold">{{ isCoordinator ? 'Cancel this Event' : 'Request cancellation' }}</h2>
    <p v-if="cancelled" role="status" class="text-sm">This Event is cancelled. Its records are kept.</p>
    <p v-else-if="cancelling" role="status" class="text-sm">Cancelling: venue, equipment and registration releases are in progress. The Event becomes Cancelled when every release has succeeded.</p>
    <template v-else-if="open">
      <p class="text-sm text-muted-foreground">Cancelling releases this Event's venue bookings, equipment and registration, and tells everyone affected. Other Events are not touched. Allowed until the Event starts.</p>
      <p v-if="pendingRequest && !isCoordinator" class="text-sm">A cancellation request is waiting for the Coordinator.</p>
      <form v-else class="grid gap-3" novalidate @submit.prevent="submit">
        <label class="grid gap-1 text-sm">Reason
          <textarea v-model="reason" aria-label="Cancellation reason" rows="3" maxlength="500" class="rounded-xl border border-border bg-background px-3 py-2" />
        </label>
        <label v-if="isCoordinator" class="flex items-center gap-2 text-sm"><input v-model="confirmed" type="checkbox" aria-label="Confirm cancellation"> I understand this releases the Event's resources</label>
        <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
        <div><Button type="submit" variant="destructive" :disabled="pending || !reason.trim() || (isCoordinator && !confirmed)">{{ pending ? 'Sending…' : isCoordinator ? 'Cancel Event' : 'Request cancellation' }}</Button></div>
      </form>
    </template>
    <p v-if="notice" role="status" class="text-sm text-success">{{ notice }}</p>
  </section>
</template>
