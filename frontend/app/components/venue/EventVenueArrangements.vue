<script setup lang="ts">
import { computed,onMounted,onUnmounted,reactive,ref,watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { calendarIsoToWallTime,calendarWallTimeToIso } from './booking-state'
import CoordinatorSafetyPreparation from '../safety/CoordinatorSafetyPreparation.vue'

interface Room {id:string;eventId:string;venueId:string;venueName?:string;venueType?:string|null;venueCapacity?:number|null;title:string;reason:string;timeZone:string;status:string;effectiveStatus?:string;version:number;startAt:string;endAt:string;occupiedStart:string;occupiedEnd:string;expiresAt:string|null;expectedAttendance:number;layout:string;facilities?:string[];accessibilityNeeds?:string[];flags:string[]}
interface Event {id:string;title:string;status:string;venueType?:string;currentCoordinatorId:string;startAt:string;endAt:string;timeZone:string;expectedAttendance:number;preferredLayout:string;accessibilityNeeds:string[];venueRequirements?:string}
interface Summary {event:Event;items:Room[];venueReady:boolean;outstanding:Array<{bookingId:string|null;venueName?:string;reasons:string[]}>}
interface Match {id:string;name:string;address?:string;capacity:number|null;setupMinutes:number;turnaroundMinutes:number;match:'FULL'|'PARTIAL';gaps:string[];canRequest:boolean;occupiedStart:string;occupiedEnd:string}
interface Option {value:string;label:string}
const props=defineProps<{eventId:string}>()
const {user}=useUserSession(),{showError}=useErrorAlert()
const requestFetch=useRequestFetch()
const {data,error,refresh}=await useFetch<Summary>(()=>`/api/bookings/events/${encodeURIComponent(props.eventId)}/summary`,{watch:[()=>props.eventId]})
const {data:options}=await useFetch<{supportedLayouts?:Option[];facilities?:Option[];accessibilityTags?:Option[]}>('/api/venues/options')
watch(error,value=>{if(value)showError(value,'Unable to load venue arrangements')},{immediate:true})
const canArrange=computed(()=>!error.value && data.value?.event.id===props.eventId && data.value.event.status==='ARRANGEMENT_PENDING' && data.value.event.currentCoordinatorId===user.value?.id)
// Enable actions only after their browser handlers have attached.
const ready=ref(false)
const open=ref(false),loading=ref(false),posting=ref<string|null>(null),matches=ref<Match[]|null>(null),message=ref('')
const sourceRoom=ref<Room|null>(null)
let searchGeneration=0
function invalidateSearch(){searchGeneration++;matches.value=null}
const form=reactive({startAt:'',endAt:'',attendance:0,layout:'',facilities:[] as string[],accessibility:[] as string[],location:'',reason:''})
const releaseReasons=reactive<Record<string,string>>({}),requestKeys=new Map<string,string>()
const now=ref(Date.now());let timer:ReturnType<typeof setInterval>|undefined
onMounted(()=>{ready.value=true;timer=setInterval(()=>{now.value=Date.now()},1000)});onUnmounted(()=>{clearInterval(timer);invalidateSearch()})
watch(()=>data.value?.event,event=>{if(event && !open.value){form.startAt=calendarIsoToWallTime(event.startAt,event.timeZone);form.endAt=calendarIsoToWallTime(event.endAt,event.timeZone);form.attendance=event.expectedAttendance;form.layout=event.preferredLayout || (event.venueType==='VIRTUAL'?'VIRTUAL':'');form.accessibility=[...(event.accessibilityNeeds || [])]}},{immediate:true})
watch(()=>[form.startAt,form.endAt,form.attendance,form.layout,form.facilities.join(','),form.accessibility.join(','),form.location],invalidateSearch,{flush:'sync'})
watch(()=>[props.eventId,data.value?.event,sourceRoom.value?.id,sourceRoom.value?.version],invalidateSearch,{flush:'sync'})
watch(()=>data.value?.items,items=>{
  if(!sourceRoom.value)return
  const current=items?.find(room=>room.id===sourceRoom.value!.id)
  if(!current || current.status==='CANCELLED'){
    sourceRoom.value=null;open.value=false;invalidateSearch();return
  }
  if(current.version!==sourceRoom.value.version || current.status!==sourceRoom.value.status){
    sourceRoom.value=current;invalidateSearch()
    message.value='This booking changed. Review its current details and search again before saving.'
  }
})
watch(()=>props.eventId,()=>{sourceRoom.value=null;open.value=false;invalidateSearch()},{flush:'sync'})
function format(value:string){return calendarIsoToWallTime(value,data.value?.event.timeZone || 'Asia/Singapore').replace('T',' ')}
function countdown(room:Room){const minutes=room.expiresAt?Math.max(0,Math.ceil((Date.parse(room.expiresAt)-now.value)/60000)):0;return minutes?`${Math.floor(minutes/60)}h ${minutes%60}m remaining`:'Expired — request a new hold'}
function status(room:Room){const value=room.expiresAt && Date.parse(room.expiresAt)<=now.value?'EXPIRED':room.effectiveStatus || room.status;return value==='CONFIRMED'?'Venue approved':value.replaceAll('_',' ').toLowerCase()}
function criteria(){const zone=data.value?.event.timeZone || 'Asia/Singapore';return {startAt:calendarWallTimeToIso(form.startAt,zone),endAt:calendarWallTimeToIso(form.endAt,zone),expectedAttendance:Number(form.attendance),layout:form.layout,facilities:[...form.facilities],accessibilityNeeds:[...form.accessibility]}}
const canChangeSource=computed(()=>sourceRoom.value && ['TENTATIVELY_HELD','REJECTED'].includes(sourceRoom.value.status) && (!sourceRoom.value.expiresAt || Date.parse(sourceRoom.value.expiresAt)>now.value))
function fillForm(room?:Room){const event=data.value?.event;if(!event)return;form.startAt=calendarIsoToWallTime(room?.startAt || event.startAt,event.timeZone);form.endAt=calendarIsoToWallTime(room?.endAt || event.endAt,event.timeZone);form.attendance=room?.expectedAttendance ?? event.expectedAttendance;form.layout=room?.layout || event.preferredLayout || (event.venueType==='VIRTUAL'?'VIRTUAL':'');form.facilities=[...(room?.facilities || [])];form.accessibility=[...new Set([...(event.accessibilityNeeds || []),...(room?.accessibilityNeeds || [])])];form.location='';form.reason='';matches.value=null;message.value=''}
function toggleSearch(){if(!ready.value || posting.value)return;invalidateSearch();if(open.value && !sourceRoom.value){open.value=false;return}sourceRoom.value=null;fillForm();open.value=true}
async function findAlternatives(room:Room){if(!ready.value || !canArrange.value || posting.value || loading.value)return;sourceRoom.value=room;open.value=true;fillForm(room);await search()}
async function search(){
  if(!ready.value || !canArrange.value || loading.value)return
  const generation=++searchGeneration,eventId=props.eventId
  loading.value=true;message.value='';matches.value=null
  try{
    const c=criteria()
    const result=await requestFetch<{items:Match[]}>(`/api/bookings/events/${encodeURIComponent(eventId)}/venue-search`,{query:{...c,facilities:c.facilities.join(','),accessibilityNeeds:c.accessibilityNeeds.join(','),location:form.location,...(sourceRoom.value?{bookingId:sourceRoom.value.id,bookingVersion:sourceRoom.value.version}:{})}})
    if(generation===searchGeneration && eventId===props.eventId && open.value && canArrange.value)matches.value=result.items
  }catch(caught){if(generation===searchGeneration){showError(caught,'Unable to search venues');message.value='Refresh the booking and check its times and requirements, then retry.'}}
  finally{loading.value=false}
}
async function request(venue:Match){if(!ready.value || !canArrange.value || posting.value || loading.value || !matches.value?.some(match=>match.id===venue.id) || !venue.canRequest || !form.reason.trim() || sourceRoom.value && !canChangeSource.value)return;posting.value=venue.id;try{const body={...(sourceRoom.value || {}),...criteria(),eventId:props.eventId,venueId:venue.id,title:sourceRoom.value?.title || data.value?.event.title || 'Event room',reason:form.reason.trim(),timeZone:data.value?.event.timeZone || 'Asia/Singapore',status:'TENTATIVELY_HELD'};if(sourceRoom.value){await requestFetch(`/api/bookings/${encodeURIComponent(sourceRoom.value.id)}`,{method:'PUT',body:{...body,version:sourceRoom.value.version}});await refresh();open.value=false;sourceRoom.value=null;matches.value=null}else{const signature=JSON.stringify(body);if(!requestKeys.has(signature))requestKeys.set(signature,crypto.randomUUID());await requestFetch('/api/bookings',{method:'POST',body,headers:{'Idempotency-Key':requestKeys.get(signature)!}});await refresh();requestKeys.delete(signature);await search()}}catch(caught){showError(caught,'Unable to save this venue arrangement');await refresh()}finally{posting.value=null}}
async function release(room:Room){if(!ready.value || !canArrange.value || posting.value || !releaseReasons[room.id]?.trim())return;posting.value=room.id;try{const path:string=`/api/bookings/${encodeURIComponent(room.id)}`;await $fetch(path,{method:'PUT',body:{...room,status:'CANCELLED',reason:releaseReasons[room.id]!.trim(),version:room.version}});releaseReasons[room.id]='';await refresh()}catch(caught){showError(caught,'Unable to release this booking');await refresh()}finally{posting.value=null}}
</script>

<template>
  <section aria-labelledby="event-venues" class="mt-8 grid gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3"><h2 id="event-venues" class="text-2xl font-semibold">Venue arrangements</h2><div class="flex gap-2"><Button size="sm" variant="outline" :disabled="!ready || Boolean(posting) || loading" @click="refresh()">Refresh arrangements</Button><Button v-if="canArrange" size="sm" :disabled="!ready || Boolean(posting)" @click="toggleSearch">Add another venue</Button></div></div>
    <p v-if="error" role="alert">Venue arrangements are unavailable. Refresh before making changes.</p>
    <template v-else-if="data">
      <p role="status" class="text-sm">{{ data.venueReady ? 'All required venues are approved for the current requirements.' : 'Venue arrangements are outstanding.' }}</p>
      <ul v-if="data.outstanding.length" id="venue-outstanding" class="list-disc pl-5 text-sm text-muted-foreground"><li v-for="item in data.outstanding" :key="item.bookingId ?? 'none'">{{ item.venueName || item.bookingId || 'Venue booking' }}: {{ item.reasons.map(r => r.replaceAll('_',' ').toLowerCase()).join(', ') }}</li></ul>
      <p class="text-sm text-muted-foreground">Technical/support approval and a current Safety Officer review are also required before preparation.</p>
      <CoordinatorSafetyPreparation v-if="data.event.id === props.eventId && data.event.currentCoordinatorId === user?.id" :event-id="props.eventId" :event-title="data.event.title" :rooms="data.items" :venue-ready="data.venueReady" :outstanding="data.outstanding" />
      <p v-if="!data.items.length" class="text-sm text-muted-foreground">No venues requested yet.</p>
      <Card v-for="room in data.items" :key="room.id" class="existing-booking grid gap-3 p-5" :data-booking-id="room.id">
        <div class="flex flex-wrap items-start justify-between gap-2"><div><h3 class="font-semibold">{{ room.venueName || room.venueId }}</h3><p class="mt-1 break-all text-xs text-muted-foreground">Booking {{ room.id }}</p></div><span class="rounded-xl bg-muted px-3 py-1 text-sm">{{ status(room) }}</span></div>
        <p class="text-sm">{{ room.expectedAttendance }} attendees · {{ room.layout }} layout</p><p class="text-sm">Event time: {{ format(room.startAt) }}–{{ format(room.endAt) }}</p><p class="text-sm text-muted-foreground">Occupied, including setup and turnaround: {{ format(room.occupiedStart) }}–{{ format(room.occupiedEnd) }} ({{ data.event.timeZone }})</p>
        <p v-if="room.expiresAt" class="text-sm">Hold expires {{ format(room.expiresAt) }} · {{ countdown(room) }}</p><p v-if="room.flags.length" role="alert" class="text-sm text-destructive">Needs attention: {{ room.flags.map(f => f.replaceAll('_',' ').toLowerCase()).join(', ') }}</p>
        <Button v-if="canArrange && room.status !== 'CANCELLED'" size="sm" variant="outline" :disabled="!ready || Boolean(posting) || loading" @click="findAlternatives(room)">Find alternatives</Button>
        <div v-if="canArrange && ['TENTATIVELY_HELD','REJECTED'].includes(room.status)" class="flex flex-wrap items-end gap-3"><label class="grid flex-1 gap-1 text-sm">Reason for releasing this room<input v-model="releaseReasons[room.id]" :disabled="!ready || Boolean(posting)" class="h-9 rounded-xl border border-border px-3" /></label><Button size="sm" variant="outline" :disabled="!ready || Boolean(posting) || !releaseReasons[room.id]?.trim()" @click="release(room)">Release this booking</Button></div>
      </Card>
      <form v-if="open && canArrange" class="grid gap-4 rounded-2xl border border-border p-5" @submit.prevent="search">
        <h3 class="text-lg font-semibold">{{ sourceRoom ? `Alternatives for ${sourceRoom.venueName || sourceRoom.venueId}` : 'Find a venue for this room' }}</h3><p class="text-sm text-muted-foreground">Times must fit within the event. Availability is checked again when you request the room.</p><p v-if="sourceRoom && !canChangeSource" class="text-sm">This booking is retained. Review suitable alternatives with Venue Staff before arranging a replacement.</p>
        <div class="grid gap-4 sm:grid-cols-2"><label class="grid gap-1 text-sm">Room start ({{ data.event.timeZone }})<input v-model="form.startAt" type="datetime-local" required class="h-9 rounded-xl border border-border px-3" /></label><label class="grid gap-1 text-sm">Room end ({{ data.event.timeZone }})<input v-model="form.endAt" type="datetime-local" required class="h-9 rounded-xl border border-border px-3" /></label><label for="room-attendance" class="grid gap-1 text-sm">Room attendance<input id="room-attendance" v-model.number="form.attendance" type="number" min="1" step="1" required class="h-9 rounded-xl border border-border px-3" /></label><label for="room-layout" class="grid gap-1 text-sm">Room layout<select id="room-layout" v-model="form.layout" required class="h-9 rounded-xl border border-border px-3"><option v-if="data.event.venueType === 'VIRTUAL'" value="VIRTUAL">No physical layout (virtual)</option><option v-for="option in options?.supportedLayouts ?? []" :key="option.value" :value="option.value">{{ option.label }}</option></select></label></div>
        <div class="grid gap-4 sm:grid-cols-2"><fieldset class="grid gap-2"><legend class="mb-2 text-sm font-medium">Required facilities</legend><label v-for="option in options?.facilities ?? []" :key="option.value" class="flex gap-2 text-sm"><input v-model="form.facilities" type="checkbox" :value="option.value" />{{ option.label }}</label></fieldset><fieldset class="grid gap-2"><legend class="mb-2 text-sm font-medium">Accessibility needs</legend><label v-for="option in options?.accessibilityTags ?? []" :key="option.value" class="flex gap-2 text-sm"><input v-model="form.accessibility" type="checkbox" :value="option.value" />{{ option.label }}</label></fieldset></div>
        <p v-if="data.event.venueRequirements" class="text-sm">Event venue notes: {{ data.event.venueRequirements }}</p><label class="grid gap-1 text-sm">Location<input v-model="form.location" placeholder="Venue name or address" class="h-9 rounded-xl border border-border px-3" /></label><Button type="submit" :disabled="!ready || loading || Boolean(posting)">{{ loading ? 'Searching…' : 'Search available venues' }}</Button><p v-if="message" role="alert" class="text-sm text-destructive">{{ message }}</p>
        <template v-if="matches"><p v-if="!matches.length" class="text-sm">No suitable available venues match these requirements.</p><label v-else-if="!sourceRoom || canChangeSource" for="room-request-reason" class="grid gap-1 text-sm">{{ sourceRoom ? 'Change reason' : 'Request reason' }}<input id="room-request-reason" v-model="form.reason" placeholder="Describe the use of this room" class="h-9 rounded-xl border border-border px-3" /></label><Card v-for="venue in matches" :key="venue.id" class="venue-search-result grid gap-2 p-4"><h4 class="font-semibold">{{ venue.name }}</h4><p class="text-sm">{{ venue.match === 'FULL' ? 'Full match' : 'Partial match' }} · Capacity {{ venue.capacity ?? '—' }} · {{ venue.address || 'Virtual venue' }}</p><p class="text-sm text-muted-foreground">Setup {{ venue.setupMinutes }} min · Turnaround {{ venue.turnaroundMinutes }} min · Occupied {{ format(venue.occupiedStart) }}–{{ format(venue.occupiedEnd) }}</p><p v-if="venue.gaps.length" class="text-sm text-destructive">Unmet requirements: {{ venue.gaps.join(', ') }}</p><Button v-if="!sourceRoom || canChangeSource" type="button" size="sm" :disabled="!ready || Boolean(posting) || !venue.canRequest || !form.reason.trim()" @click="request(venue)">{{ posting === venue.id ? 'Saving…' : sourceRoom ? 'Change this booking' : 'Request this venue' }}</Button></Card></template>
      </form>
    </template>
  </section>
</template>
