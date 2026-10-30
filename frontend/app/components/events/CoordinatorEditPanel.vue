<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { apiErrorMessage } from '@/components/shared/api-error'

// CS-43: the assigned Coordinator corrects routine wording. Dates, venue,
// capacity and budget are significant changes and go through a change proposal.
const props = defineProps<{ requestId: string, description: string, version: number }>()
const emit = defineEmits<{ saved: [record: Record<string, any>] }>()
const requestFetch = useRequestFetch()
const text = ref(props.description ?? ''), pending = ref(false), error = ref(''), done = ref('')
const changed = computed(() => text.value.trim() !== (props.description ?? '').trim())
async function save() {
  if (pending.value || !changed.value) return
  pending.value = true; error.value = ''; done.value = ''
  try {
    const result = await requestFetch(`/api/events/${props.requestId}/coordinator-edit`, { method: 'POST', body: { description: text.value, version: props.version } })
    done.value = 'Description updated. The change is in History.'
    emit('saved', result as Record<string, any>)
  } catch (e) { error.value = apiErrorMessage(e, 'Could not save the change. Refresh and try again.') }
  finally { pending.value = false }
}
</script>
<template>
  <form aria-label="Coordinator edit" class="grid gap-3 rounded-xl border p-4" novalidate @submit.prevent="save">
    <h2 class="text-base font-semibold">Edit description</h2>
    <p class="text-sm text-muted-foreground">You can correct the wording here. For dates, venue, capacity or budget, use Propose a change.</p>
    <label class="grid gap-1 text-sm">Description
      <textarea v-model="text" aria-label="Description" rows="5" maxlength="5000" class="rounded-xl border border-border bg-background px-3 py-2" />
    </label>
    <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
    <p v-if="done" role="status" class="text-sm text-success">{{ done }}</p>
    <div><Button type="submit" :disabled="pending || !changed || !text.trim()">{{ pending ? 'Saving…' : 'Save description' }}</Button></div>
  </form>
</template>
