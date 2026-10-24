<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { calendarIsoToWallTime } from './booking-state'

interface Commitment {
  id: string
  eventId: string | null
  title: string
  status: string
  currentCoordinatorId: string | null
  occupiedStart: string
  occupiedEnd: string
}
interface Conflict extends Commitment {
  version:number
  originalBookingId?:string
  venueId: string
  venueName: string
  timeZone: string
  flags: string[]
  conflicts: Commitment[]
}
interface Venue { id: string; name: string; version: number; timeZone: string; setupMinutes: number; turnaroundMinutes: number }
interface Report { items: Conflict[]; venues: Venue[]; checkedAt: string }

const { data, error, refresh } = await useFetch<Report>('/api/bookings/conflicts')
const requestFetch = useRequestFetch()
const { showError } = useErrorAlert()
const ready = ref(false)
const saving = ref<string | null>(null)
const selectedId = ref<string | null>(null)
const reasons = reactive<Record<string, string>>({})
const message = ref('')
onMounted(() => { ready.value = true })
watch(error, value => { if (value) showError(value, 'Unable to load venue conflicts') }, { immediate: true })
watch(() => data.value?.items, items => {
  if (!items?.some(item => item.id === selectedId.value)) selectedId.value = items?.[0]?.id ?? null
}, { immediate: true })
const selected = computed(() => data.value?.items.find(item => item.id === selectedId.value))
const panes = computed(() => selected.value ? [selected.value, ...selected.value.conflicts] : [])
function format(value: string) {
  return calendarIsoToWallTime(value, selected.value?.timeZone || 'Asia/Singapore').replace('T', ' ')
}
function status(value: string) {
  return value === 'CONFIRMED' ? 'Venue approved' : value.replaceAll('_', ' ').toLowerCase()
}
async function recheck(venue: Venue) {
  if (!ready.value || saving.value || !reasons[venue.id]?.trim()) return
  saving.value = venue.id
  message.value = ''
  try {
    const result = await requestFetch<{ changed: string[] }>('/api/bookings/rechecks', {
      method: 'POST', body: { venueId: venue.id, version: venue.version, reason: reasons[venue.id]!.trim() },
    })
    reasons[venue.id] = ''
    await refresh()
    message.value = `${venue.name}: recheck complete; ${result.changed.length} booking records updated.`
  } catch (caught) {
    showError(caught, 'Unable to recheck existing bookings')
    await refresh()
  } finally { saving.value = null }
}
const restoreReason=ref(''),restoreConfirm=ref(false),restoreKeys=new Map<string,string>()
async function restore(){
 const booking=selected.value
 if(!booking||saving.value||!restoreConfirm.value||!restoreReason.value.trim())return
 saving.value=booking.id
 try{
  const body={version:booking.version,confirm:true,reason:restoreReason.value.trim()},signature=JSON.stringify([booking.id,body])
  if(!restoreKeys.has(signature))restoreKeys.set(signature,crypto.randomUUID())
  await requestFetch(`/api/bookings/${booking.id}/restore`,{method:'POST',body,headers:{'Idempotency-Key':restoreKeys.get(signature)!}})
  restoreReason.value='';restoreConfirm.value=false;await refresh();message.value='Staff restoration confirmed. The Coordinator and Organiser will be informed.'
 }catch(caught){showError(caught,'Unable to restore this booking');await refresh()}
 finally{saving.value=null}
}
</script>

<template>
  <section aria-labelledby="buffer-conflicts" class="mt-7 grid gap-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 id="buffer-conflicts" class="text-xl font-semibold">Buffer conflicts</h2>
      <Button size="sm" variant="outline" :disabled="!ready || Boolean(saving)" @click="refresh()">Refresh conflicts</Button>
    </div>
    <p class="text-sm text-muted-foreground">Existing bookings are retained. Review both occupied windows and coordinate a suitable change; there is no conflict override.</p>
    <p v-if="error" role="alert">Venue conflicts are unavailable. Refresh before making changes.</p>
    <template v-else-if="data">
      <p v-if="!data.items.length" class="text-sm">No current venue conflicts or outstanding suitability flags.</p>
      <div v-if="data.items.length" class="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Flagged venue bookings" class="grid content-start gap-2">
          <button v-for="item in data.items" :key="item.id" type="button" :disabled="!ready || Boolean(saving)" class="rounded-xl border p-3 text-left text-sm" :class="item.id === selectedId ? 'border-primary bg-secondary' : 'border-border'" @click="selectedId = item.id">
            <span class="block font-medium">{{ item.title }}</span><span class="block">{{ item.venueName }} · {{ status(item.status) }}</span>
          </button>
        </nav>
        <div v-if="selected" class="grid gap-3">
          <p role="alert" class="text-sm text-destructive">Needs attention: {{ selected.flags.map(flag => flag.replaceAll('_', ' ').toLowerCase()).join(', ') }}</p>
          <section v-if="selected.flags.includes('AFFECTED_UNAVAILABLE')" aria-label="Restore original booking" class="grid gap-2 rounded-xl border p-4"><p>The current Coordinator must withdraw any pending replacement first. Restoration rechecks the full occupied interval and all requirements.</p><label class="grid gap-1 text-sm">Restoration reason<input v-model="restoreReason" maxlength="500" class="h-9 rounded-xl border px-3" /></label><label class="flex gap-2 text-sm"><input v-model="restoreConfirm" type="checkbox" />I confirm that Venue Staff can restore this original booking.</label><Button :disabled="!ready||Boolean(saving)||!restoreConfirm||!restoreReason.trim()" @click="restore">Confirm restoration</Button></section>
          <div class="grid gap-3 sm:grid-cols-2">
            <Card v-for="booking in panes" :key="booking.id" class="conflict-pane grid gap-2 p-4" :data-booking-id="booking.id">
              <h3 class="font-semibold">{{ booking.title }}</h3><p class="text-sm">{{ status(booking.status) }}</p>
              <p class="text-sm">Occupied {{ format(booking.occupiedStart) }}–{{ format(booking.occupiedEnd) }} ({{ selected.timeZone }})</p>
              <p class="text-sm">Assigned Coordinator: {{ booking.currentCoordinatorId || 'Not assigned' }}</p>
              <p class="break-all text-xs text-muted-foreground">Booking {{ booking.id }}</p>
              <NuxtLink v-if="booking.eventId" :to="`/events/${encodeURIComponent(booking.eventId)}`" class="text-sm underline">View Event</NuxtLink>
            </Card>
          </div>
        </div>
      </div>
      <details class="rounded-xl border border-border p-4 text-sm">
        <summary class="cursor-pointer font-medium">Recheck existing bookings after buffer rollout</summary>
        <p class="mt-3 text-muted-foreground">Checks current settings and records affected flags and history. It does not approve, cancel or delete a booking.</p>
        <div v-for="venue in data.venues" :key="venue.id" class="mt-4 grid gap-2">
          <p>{{ venue.name }} · Setup {{ venue.setupMinutes }} min · Turnaround {{ venue.turnaroundMinutes }} min</p>
          <label :for="`recheck-reason-${venue.id}`" class="grid gap-1">Recheck reason<input :id="`recheck-reason-${venue.id}`" v-model="reasons[venue.id]" :disabled="!ready || Boolean(saving)" class="h-9 rounded-xl border border-border px-3" /></label>
          <Button size="sm" variant="outline" :disabled="!ready || Boolean(saving) || !reasons[venue.id]?.trim()" @click="recheck(venue)">Recheck existing bookings</Button>
        </div>
      </details>
      <p v-if="message" role="status" class="text-sm">{{ message }}</p>
    </template>
  </section>
</template>
