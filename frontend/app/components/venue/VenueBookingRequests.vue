<script setup lang="ts">
import { computed,onMounted,onUnmounted,reactive,ref,watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { calendarIsoToWallTime } from './booking-state'
import type { CalendarBooking } from './calendar-state'
interface Request extends CalendarBooking {extensionCount?:number;extensionRequest?:{requestedById:string;expiresAt:string;reason:string}|null;version:number;venueName?:string;venueCapacity?:number|null;organiserId?:string;currentCoordinatorId?:string;currentVenueNotes?:string;effectiveStatus?:string;expectedAttendance?:number;layout?:string;facilities?:string[];accessibilityNeeds?:string[]}
const props=defineProps<{canDecide:boolean}>(),emit=defineEmits<{updated:[]}>()
const {data,error,refresh}=await useFetch<{items:Request[]}>('/api/bookings',{query:{status:'TENTATIVELY_HELD'}})
const {showError}=useErrorAlert()
const requestFetch=useRequestFetch()
watch(error,value=>{if(value)showError(value,'Unable to load booking requests')},{immediate:true})
const ready=ref(false)
const now=ref(Date.now());let timer:ReturnType<typeof setInterval>|undefined
onMounted(()=>{ready.value=true;timer=setInterval(()=>{now.value=Date.now()},1000)})
onUnmounted(()=>clearInterval(timer))
const search=ref(''),saving=ref<string|null>(null),reasons=reactive<Record<string,string>>({})
const items=computed(()=>(data.value?.items ?? []).filter(row=>`${row.title} ${row.venueName || row.venueId} ${row.currentCoordinatorId || ''}`.toLowerCase().includes(search.value.toLowerCase())))
function format(value:string|undefined,booking:Request){return value?calendarIsoToWallTime(value,booking.timeZone || 'Asia/Singapore').replace('T',' '):'—'}
function active(booking:Request,at=now.value){return props.canDecide && !booking.flags?.includes('EVENT_NOT_FOUND') && booking.status==='TENTATIVELY_HELD' && Boolean(booking.expiresAt) && Date.parse(booking.expiresAt!)>at && booking.effectiveStatus!=='EXPIRED'}
async function decide(booking:Request,status:'CONFIRMED'|'REJECTED'){
  if (!ready.value || !active(booking,Date.now()) || saving.value || !reasons[booking.id]?.trim())return
  saving.value=booking.id
  try {await requestFetch(`/api/bookings/${encodeURIComponent(booking.id)}/decision`,{method:'PUT',body:{status,version:booking.version,reason:reasons[booking.id]!.trim()}});reasons[booking.id]='';await refresh();emit('updated')}
  catch(caught){showError(caught,'Unable to decide this booking');await refresh()}
  finally{saving.value=null}
}
async function extend(booking:Request){
  if(!ready.value || !active(booking,Date.now()) || saving.value || !reasons[booking.id]?.trim() || !booking.extensionRequest || booking.extensionRequest.requestedById!==booking.currentCoordinatorId || (booking.extensionCount ?? 0)>=1)return
  saving.value=booking.id
  try{const expiresAt=booking.extensionRequest.expiresAt;await requestFetch(`/api/bookings/${encodeURIComponent(booking.id)}/hold-extension`,{method:'PUT',body:{version:booking.version,expiresAt,reason:reasons[booking.id]!.trim()}});await refresh();emit('updated')}
  catch(caught){showError(caught,'Unable to extend this hold');await refresh()}
  finally{saving.value=null}
}
</script>
<template>
  <section class="mt-7 grid gap-4"><h2 class="text-xl font-semibold">Pending booking requests</h2><label class="grid gap-1 text-sm">Search requests<input v-model="search" :disabled="!ready" type="search" placeholder="Event, venue or Coordinator" class="h-9 rounded-xl border border-border px-3" /></label>
    <p v-if="!error && !items.length" class="text-sm text-muted-foreground">No booking requests awaiting review.</p>
    <Card v-for="booking in error ? [] : items" :key="booking.id" class="grid gap-4 rounded-[18px] p-5" :data-booking-id="booking.id">
      <h3 class="text-xl font-medium">{{ booking.title }} · {{ booking.venueName || booking.venueId }}</h3><p class="break-all text-xs text-muted-foreground">Booking {{ booking.id }} · Event {{ booking.eventId || 'Missing Event link' }}</p>
      <dl class="grid gap-3 text-sm sm:grid-cols-3"><div><dt class="text-xs text-muted-foreground">Organiser</dt><dd>{{ booking.organiserId || '—' }}</dd></div><div><dt class="text-xs text-muted-foreground">Assigned coordinator</dt><dd>{{ booking.currentCoordinatorId || 'Unavailable' }}</dd></div><div><dt class="text-xs text-muted-foreground">Requested by</dt><dd>{{ booking.requestedById || '—' }}</dd></div><div><dt class="text-xs text-muted-foreground">Attendance / capacity</dt><dd>{{ booking.expectedAttendance ?? '—' }} / {{ booking.venueCapacity ?? '—' }}</dd></div><div><dt class="text-xs text-muted-foreground">Layout</dt><dd>{{ booking.layout || '—' }}</dd></div></dl>
      <p class="text-sm">Event time: {{ format(booking.startAt,booking) }}–{{ format(booking.endAt,booking) }}</p><p class="text-sm text-muted-foreground">Occupied: {{ format(booking.occupiedStart,booking) }}–{{ format(booking.occupiedEnd,booking) }} · Setup {{ booking.setupMinutes ?? 0 }} min · Turnaround {{ booking.turnaroundMinutes ?? 0 }} min</p>
      <p class="text-sm">Hold expires {{ format(booking.expiresAt || undefined,booking) }} ({{ booking.timeZone }})</p><p v-if="booking.facilities?.length" class="text-sm">Required facilities: {{ booking.facilities.join(', ') }}</p><p v-if="booking.accessibilityNeeds?.length" class="text-sm">Accessibility: {{ booking.accessibilityNeeds.join(', ') }}</p><p v-if="booking.currentVenueNotes" class="text-sm">Current Event venue notes: {{ booking.currentVenueNotes }}</p><p class="text-sm">Request reason: {{ booking.reason }}</p>
      <p v-if="booking.flags?.length" role="alert" class="text-sm text-destructive">Resolve before approval: {{ booking.flags.join(', ') }}</p><p v-if="!active(booking)" class="text-sm text-muted-foreground">This hold is expired or unavailable for a decision.</p>
      <label :for="`decision-reason-${booking.id}`" class="grid gap-1 text-sm">Decision or extension reason<input :id="`decision-reason-${booking.id}`" v-model="reasons[booking.id]" maxlength="500" :disabled="!ready || !active(booking) || Boolean(saving)" class="h-9 rounded-xl border border-border px-3" /></label>
      <div class="flex flex-wrap gap-2"><Button size="sm" :disabled="!ready || !active(booking) || Boolean(saving) || !reasons[booking.id]?.trim() || Boolean(booking.flags?.length)" @click="decide(booking,'CONFIRMED')">Approve</Button><Button size="sm" variant="destructive" :disabled="!ready || !active(booking) || Boolean(saving) || !reasons[booking.id]?.trim()" @click="decide(booking,'REJECTED')">Reject</Button><Button size="sm" variant="outline" :disabled="!ready || Boolean(saving)" @click="refresh()">Refresh request</Button></div>
      <div v-if="active(booking) && booking.extensionRequest && booking.extensionRequest.requestedById === booking.currentCoordinatorId && (booking.extensionCount ?? 0) < 1" class="grid gap-2 text-sm"><p>Coordinator requested deadline: {{ format(booking.extensionRequest.expiresAt,booking) }} ({{ booking.timeZone }})</p><p>{{ booking.extensionRequest.reason }}</p><Button size="sm" variant="outline" :disabled="!ready || Boolean(saving) || !reasons[booking.id]?.trim()" @click="extend(booking)">Approve extension</Button></div>
    </Card>
  </section>
</template>
