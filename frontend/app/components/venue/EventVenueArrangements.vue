<script setup lang="ts">
import { computed,onMounted,onUnmounted,reactive,ref,watch } from 'vue'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import ConfirmationDialog from './ConfirmationDialog.vue'
import { calendarIsoToWallTime,calendarWallTimeToIso } from './booking-state'
import SafetyWorkspace from '../safety/SafetyWorkspace.vue'
import CoordinatorSafetyPreparation from '../safety/CoordinatorSafetyPreparation.vue'

interface Room {originalBookingId?:string;replacementBookingId?:string;displayStatus?:string;resubmittedFromId?:string;extensionCount?:number;extensionRequest?:{expiresAt:string;reason:string;requestedById:string}|null;id:string;eventId:string;venueId:string;venueName?:string;venueType?:string|null;venueCapacity?:number|null;title:string;reason:string;timeZone:string;status:string;effectiveStatus?:string;version:number;startAt:string;endAt:string;occupiedStart:string;occupiedEnd:string;expiresAt:string|null;expectedAttendance:number;layout:string;facilities?:string[];accessibilityNeeds?:string[];flags:string[]}
interface Event {version:number;safetyState?:string;id:string;title:string;status:string;venueType?:string;currentCoordinatorId:string;startAt:string;endAt:string;timeZone:string;expectedAttendance:number;preferredLayout:string;accessibilityNeeds:string[];venueRequirements?:string}
interface Summary {attendancePlan?:{expectedAttendance:number;ready:boolean;sessions:Array<{startAt:string;endAt:string;allocated:number|null;reason:string|null}>};primaryVenue?:{bookingId:string|null;version:number;available:boolean};event:Event;items:Room[];venueReady:boolean;outstanding:Array<{bookingId:string|null;venueName?:string;reasons:string[]}>}
interface Match {id:string;name:string;address?:string;capacity:number|null;setupMinutes:number;turnaroundMinutes:number;match:'FULL'|'PARTIAL';gaps:string[];canRequest:boolean;occupiedStart:string;occupiedEnd:string}
interface Option {value:string;label:string}
const props=defineProps<{eventId:string}>()
const emit=defineEmits<{changed:[]}>()
const {user}=useUserSession(),{showError}=useErrorAlert()
const requestFetch=useRequestFetch()
const {data,error,refresh}=await useFetch<Summary>(()=>`/api/bookings/events/${encodeURIComponent(props.eventId)}/summary`,{watch:[()=>props.eventId]})
const {data:safetyData}=await useFetch<any>(()=>`/api/safety/events/${encodeURIComponent(props.eventId)}`,{watch:[()=>props.eventId]})
const {data:options}=await useFetch<{supportedLayouts?:Option[];facilities?:Option[];accessibilityTags?:Option[]}>('/api/venues/options')
async function refreshAndNotify(){await refresh();emit('changed')}
watch(error,value=>{if(value)showError(value,'Unable to load venue arrangements')},{immediate:true})
const canReview=computed(()=>!error.value&&data.value?.event.id===props.eventId&&data.value?.event.currentCoordinatorId===user.value?.id&&['ARRANGEMENT_PENDING','CONFIRMED','PREPARATION'].includes(data.value?.event.status||''))
const canArrange=computed(()=>!error.value && data.value?.event.id===props.eventId && data.value.event.status==='ARRANGEMENT_PENDING' && !['PREPARING','PENDING','APPROVED'].includes(data.value.event.safetyState || '') && data.value.event.currentCoordinatorId===user.value?.id)
// Enable actions only after their browser handlers have attached.
const ready=ref(false)
const open=ref(false),loading=ref(false),posting=ref<string|null>(null),matches=ref<Match[]|null>(null),message=ref('')
const sourceRoom=ref<Room|null>(null),searchMode=ref<'change'|'replacement'|'resubmit'>('change'),cancelRoom=ref<Room|null>(null)
let searchGeneration=0
function invalidateSearch(){searchGeneration++;matches.value=null}
const form=reactive({startAt:'',endAt:'',attendance:0,layout:'',facilities:[] as string[],accessibility:[] as string[],location:'',reason:''})
const extensionDates=reactive<Record<string,string>>({}),extensionReasons=reactive<Record<string,string>>({})
const releaseReasons=reactive<Record<string,string>>({}),requestKeys=new Map<string,string>()
const releaseError=ref('')
// Preserve the exact review request across refreshes and lost acknowledgements.
// The Event version changes when review succeeds, before Booking is mutated.
const reviews=new Map<string,{key:string;body:Record<string,unknown>;reviewId?:string}>()
const now=ref(Date.now());let timer:ReturnType<typeof setInterval>|undefined
onMounted(()=>{ready.value=true;timer=setInterval(()=>{now.value=Date.now()},1000)});onUnmounted(()=>{clearInterval(timer);invalidateSearch()})
watch(()=>data.value?.event,event=>{if(event && !open.value){form.startAt=calendarIsoToWallTime(event.startAt,event.timeZone);form.endAt=calendarIsoToWallTime(event.endAt,event.timeZone);form.attendance=event.expectedAttendance;form.layout=event.preferredLayout || (event.venueType==='VIRTUAL'?'VIRTUAL':'');form.accessibility=[...(event.accessibilityNeeds || [])]}},{immediate:true})
watch(()=>[form.startAt,form.endAt,form.attendance,form.layout,form.facilities.join(','),form.accessibility.join(','),form.location],invalidateSearch,{flush:'sync'})
watch(()=>[props.eventId,data.value?.event,sourceRoom.value?.id,sourceRoom.value?.version],invalidateSearch,{flush:'sync'})
watch(()=>data.value?.items,items=>{
  if(cancelRoom.value){
    const current=items?.find(room=>room.id===cancelRoom.value!.id)
    if(!current || current.version!==cancelRoom.value.version || current.status!==cancelRoom.value.status){
      cancelRoom.value=null;releaseError.value=''
      message.value='This booking changed. Review the current details before cancelling.'
    }
  }
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
watch(()=>props.eventId,()=>{sourceRoom.value=null;cancelRoom.value=null;releaseError.value='';reviews.clear();open.value=false;invalidateSearch()},{flush:'sync'})
function format(value:string){return calendarIsoToWallTime(value,data.value?.event.timeZone || 'Asia/Singapore').replace('T',' ')}
function countdown(room:Room){const minutes=room.expiresAt?Math.max(0,Math.ceil((Date.parse(room.expiresAt)-now.value)/60000)):0;return minutes?`${Math.floor(minutes/60)}h ${minutes%60}m remaining`:'Expired — request a new hold'}
function status(room:Room){if(room.displayStatus?.startsWith('Affected'))return room.displayStatus;const value=room.expiresAt && Date.parse(room.expiresAt)<=now.value?'EXPIRED':room.effectiveStatus || room.status;return value==='CONFIRMED'?'Venue approved':value.replaceAll('_',' ').toLowerCase()}
function pendingReplacement(room:Room){return Boolean(room.originalBookingId&&data.value?.items.find(original=>original.id===room.originalBookingId)?.status!=='REPLACED')}
function canRequestExtension(room:Room){return canArrange.value && room.status==='TENTATIVELY_HELD' && Boolean(room.expiresAt) && Date.parse(room.expiresAt!)>now.value && (room.extensionCount ?? 0)<1}
async function requestExtension(room:Room){
  if(!ready.value || !canRequestExtension(room) || posting.value || !extensionDates[room.id] || !extensionReasons[room.id]?.trim())return
  posting.value=room.id
  try{
    const expiresAt=calendarWallTimeToIso(extensionDates[room.id]!,data.value!.event.timeZone)
    await requestFetch(`/api/bookings/${encodeURIComponent(room.id)}/hold-extension/request`,{method:'POST',body:{version:room.version,expiresAt,reason:extensionReasons[room.id]!.trim()}})
    extensionDates[room.id]='';extensionReasons[room.id]='';await refreshAndNotify()
  }catch(caught){showError(caught,'Unable to request this extension');await refresh()}
  finally{posting.value=null}
}
function criteria(){const zone=data.value?.event.timeZone || 'Asia/Singapore';return {startAt:calendarWallTimeToIso(form.startAt,zone),endAt:calendarWallTimeToIso(form.endAt,zone),expectedAttendance:Number(form.attendance),layout:form.layout,facilities:[...form.facilities],accessibilityNeeds:[...form.accessibility]}}
const canChangeSource=computed(()=>sourceRoom.value && ['TENTATIVELY_HELD','REJECTED','CONFIRMED'].includes(sourceRoom.value.status))
function fillForm(room?:Room){const event=data.value?.event;if(!event)return;form.startAt=calendarIsoToWallTime(room?.startAt || event.startAt,event.timeZone);form.endAt=calendarIsoToWallTime(room?.endAt || event.endAt,event.timeZone);form.attendance=room?.expectedAttendance ?? event.expectedAttendance;form.layout=room?.layout || event.preferredLayout || (event.venueType==='VIRTUAL'?'VIRTUAL':'');form.facilities=[...(room?.facilities || [])];form.accessibility=[...new Set([...(event.accessibilityNeeds || []),...(room?.accessibilityNeeds || [])])];form.location='';form.reason='';matches.value=null;message.value=''}
function toggleSearch(){if(!ready.value || posting.value)return;invalidateSearch();if(open.value && !sourceRoom.value){open.value=false;return}sourceRoom.value=null;fillForm();open.value=true}
async function findAlternatives(room:Room,mode:'change'|'replacement'|'resubmit'='change'){if(!ready.value || !canReview.value || posting.value || loading.value)return;searchMode.value=mode;sourceRoom.value=room;open.value=true;fillForm(room);await search()}
async function search(){
  if(!ready.value || !canReview.value || loading.value)return
  const generation=++searchGeneration,eventId=props.eventId
  loading.value=true;message.value='';matches.value=null
  try{
    const c=criteria()
    const result=await requestFetch<{items:Match[]}>(`/api/bookings/events/${encodeURIComponent(eventId)}/venue-search`,{query:{...c,facilities:c.facilities.join(','),accessibilityNeeds:c.accessibilityNeeds.join(','),location:form.location,...(sourceRoom.value?{bookingId:sourceRoom.value.id,bookingVersion:sourceRoom.value.version,includeSource:searchMode.value!=='replacement'}:{})}})
    if(generation===searchGeneration && eventId===props.eventId && open.value && canReview.value)matches.value=result.items
  }catch(caught){if(generation===searchGeneration){showError(caught,'Unable to search venues');message.value='Refresh the booking and check its times and requirements, then retry.'}}
  finally{loading.value=false}
}
async function reviewChange(room:Room,action:string,body:any){
 if(room.status!=='CONFIRMED')return null
 const signature=JSON.stringify([props.eventId,user.value?.id,room.id,room.version,action,body])
 let operation=reviews.get(signature)
 if(!operation){operation={key:crypto.randomUUID(),body:{version:data.value!.event.version,bookingId:room.id,bookingVersion:room.version,action,reason:body.reason,proposed:JSON.parse(JSON.stringify(body))}};reviews.set(signature,operation)}
 if(operation.reviewId)return operation.reviewId
 try{
  const response=await requestFetch<{reviewId:string}>(`/api/safety/events/${encodeURIComponent(props.eventId)}/venue-change-reviews`,{method:'POST',headers:{'Idempotency-Key':operation.key},body:operation.body})
  operation.reviewId=response.reviewId
  return response.reviewId
 }catch(caught){
  // A definite version refusal committed no review; rebuild from the refreshed Event.
  if(errorCode(caught)==='STALE_VERSION')reviews.delete(signature)
  throw caught
 }
}
function errorCode(caught:any){return caught?.data?.data?.error?.code||caught?.data?.error?.code||caught?.code}
function discardStaleReview(caught:any){if(['STALE_CHANGE_REVIEW','EVENT_NOT_PLANNING'].includes(errorCode(caught)))reviews.clear()}
async function request(venue:Match){
 if(!ready.value||!canReview.value||posting.value||loading.value||!matches.value?.some(match=>match.id===venue.id)||!venue.canRequest||!form.reason.trim())return
 posting.value=venue.id
 try{
  const source=sourceRoom.value
  const body:any={...criteria(),eventId:props.eventId,venueId:venue.id,title:source?.title||data.value!.event.title,reason:form.reason.trim(),timeZone:data.value!.event.timeZone,status:'TENTATIVELY_HELD',required:true}
  if(source){
   body.version=source.version
   body.changeReviewId=await reviewChange(source,searchMode.value==='replacement'?'REPLACEMENT':'CHANGE',body)
  }
  const signature=JSON.stringify(body);if(!requestKeys.has(signature))requestKeys.set(signature,crypto.randomUUID())
  const path=source?`/api/bookings/${encodeURIComponent(source.id)}${searchMode.value==='replacement'?'/replacements':searchMode.value==='resubmit'?'/resubmit':''}`:'/api/bookings'
  await requestFetch(path,{method:source&&searchMode.value==='change'?'PUT':'POST',body,headers:{'Idempotency-Key':requestKeys.get(signature)!}})
  await refreshAndNotify();requestKeys.delete(signature);if(source){open.value=false;sourceRoom.value=null;matches.value=null}else await search()
 }catch(caught){discardStaleReview(caught);showError(caught,'Unable to save this venue arrangement');await refresh()}
 finally{posting.value=null}
}
async function selectPrimary(room:Room){
  if(!ready.value || !canArrange.value || posting.value || room.eventId!==props.eventId)return
  const eventId=props.eventId
  posting.value=room.id
  try{
    await requestFetch(`/api/bookings/events/${encodeURIComponent(eventId)}/primary-venue`,{method:'PUT',body:{bookingId:room.id,bookingVersion:room.version,version:data.value?.primaryVenue?.version ?? 0}})
    if(eventId===props.eventId)await refreshAndNotify()
  }catch(caught){showError(caught,'Unable to select the primary location');if(eventId===props.eventId)await refresh()}
  finally{posting.value=null}
}
const lastVenue=computed(()=>Boolean(cancelRoom.value&&!data.value?.items.some(room=>room.id!==cancelRoom.value!.id&&!pendingReplacement(room)&&['CONFIRMED','TENTATIVELY_HELD'].includes(room.effectiveStatus||room.status))))
async function release(room:Room){
 if(!ready.value||!canReview.value||posting.value||!releaseReasons[room.id]?.trim())return
 releaseError.value=''
 posting.value=room.id
 try{
  const body:any={...room,status:'CANCELLED',reason:releaseReasons[room.id]!.trim(),version:room.version,confirmLastVenue:lastVenue.value}
  body.changeReviewId=await reviewChange(room,'CANCEL',body)
  const signature=JSON.stringify(body);if(!requestKeys.has(signature))requestKeys.set(signature,crypto.randomUUID())
  await requestFetch(`/api/bookings/${encodeURIComponent(room.id)}`,{method:'PUT',body,headers:{'Idempotency-Key':requestKeys.get(signature)!}})
  cancelRoom.value=null;releaseReasons[room.id]='';await refreshAndNotify()
 }catch(caught){releaseError.value='This booking could not be released. Review the current details and try again.';discardStaleReview(caught);showError(caught,'Unable to release this booking');await refresh()}
 finally{posting.value=null}
}
</script>

<template>
  <section aria-labelledby="event-venues" class="grid gap-5">
    <div class="flex flex-wrap items-end justify-between gap-4"><div><h2 id="event-venues" class="text-2xl font-semibold tracking-tight">Venue arrangements</h2><p class="mt-1 text-sm text-muted-foreground">Review Event spaces, select the attendee location, and arrange alternatives when needed.</p></div><div class="flex flex-wrap gap-2"><Button size="sm" variant="outline" :disabled="!ready || Boolean(posting) || loading" @click="refresh()">Refresh arrangements</Button><Button v-if="canArrange" size="sm" :disabled="!ready || Boolean(posting)" @click="toggleSearch">Add another venue</Button></div></div>
    <Alert v-if="error" variant="destructive"><p class="col-start-2">Venue arrangements are unavailable. Refresh before making changes.</p></Alert>
    <template v-else-if="data">
      <Alert v-if="data.event.status==='CANCELLING'" role="status"><p class="col-start-2">Cancelling — resource releases are in progress. The Event will be marked Cancelled only when all required releases finish.</p></Alert>
      <template v-else>
      <section class="grid gap-3 rounded-[18px] border border-border p-4 text-sm"><p role="status" class="font-medium">{{ data.venueReady ? 'All required venues are approved for the current requirements.' : 'Venue arrangements are outstanding.' }}</p><ul v-if="data.outstanding.length" id="venue-outstanding" class="grid gap-1 text-muted-foreground"><li v-for="item in data.outstanding" :key="item.bookingId ?? 'none'">{{ item.venueName || item.bookingId || 'Venue booking' }}: {{ item.reasons.map(r => r.replaceAll('_',' ').toLowerCase()).join(', ') }}</li></ul><section v-if="data.attendancePlan" aria-label="Attendance allocations" class="grid gap-1 border-t border-border pt-3"><p>Event attendance: {{ data.attendancePlan.expectedAttendance }}. Each simultaneous session must account for this total; room capacities are not added across the day.</p><p v-for="session in data.attendancePlan.sessions" :key="session.startAt" class="text-muted-foreground">{{ format(session.startAt) }}–{{ format(session.endAt) }}: {{ session.allocated ?? 'Unverified' }} allocated<span v-if="session.reason"> — {{ session.reason.replaceAll('_',' ').toLowerCase() }}</span></p></section><p class="border-t border-border pt-3 text-muted-foreground">Technical/support approval and a current Safety Officer review are also required before preparation.</p></section>
      <SafetyWorkspace v-if="safetyData?.event" :event-id="props.eventId" @changed="refreshAndNotify" />
      <CoordinatorSafetyPreparation v-else-if="data.event.id === props.eventId && data.event.currentCoordinatorId === user?.id" :event-id="props.eventId" :event-title="data.event.title" :rooms="data.items" :venue-ready="data.venueReady" :outstanding="data.outstanding" />
      <p v-if="!data.primaryVenue?.bookingId" class="text-sm text-muted-foreground">Choose a primary attendee location. Other rooms remain part of the Event.</p>
      <p v-else-if="!data.primaryVenue.available" role="alert" class="text-sm">The selected primary location needs review before publication.</p>
      </template>
      <p v-if="!data.items.length" class="text-sm text-muted-foreground">No venues requested yet.</p>
      <Card v-for="room in data.items" :key="room.id" class="existing-booking grid gap-4 rounded-[18px] border border-border !bg-transparent p-5 !shadow-none !ring-0" :data-booking-id="room.id">
        <div class="flex flex-wrap items-start justify-between gap-3"><div><h3 class="font-medium">{{ room.venueName || room.venueId }}</h3><p class="mt-1 break-all text-xs text-muted-foreground">Booking {{ room.id }}</p></div><Badge variant="outline" class="border-transparent bg-muted font-normal text-muted-foreground">{{ status(room) }}</Badge></div>
        <p v-if="data.primaryVenue?.bookingId === room.id" class="text-sm font-medium">Primary attendee location</p>
        <Button v-else-if="canArrange && ['TENTATIVELY_HELD','CONFIRMED'].includes(room.effectiveStatus || room.status) && !room.flags.length" size="sm" variant="outline" :disabled="!ready || Boolean(posting) || loading || room.status === 'TENTATIVELY_HELD' && (!room.expiresAt || Date.parse(room.expiresAt) <= now)" @click="selectPrimary(room)">Make primary location</Button>
        <div class="grid gap-3 border-y border-border py-3 text-sm sm:grid-cols-2"><p><span class="text-muted-foreground">Attendance</span><br>{{ room.expectedAttendance }} attendees · {{ room.layout }} layout</p><p><span class="text-muted-foreground">Event time</span><br>{{ format(room.startAt) }}–{{ format(room.endAt) }}</p></div><p class="text-sm text-muted-foreground">Occupied, including setup and turnaround: {{ format(room.occupiedStart) }}–{{ format(room.occupiedEnd) }} ({{ data.event.timeZone }})</p>
        <p v-if="room.expiresAt" class="text-sm">Hold expires {{ format(room.expiresAt) }} · {{ countdown(room) }}</p><p v-if="room.flags.length" role="alert" class="text-sm text-destructive">Needs attention: {{ room.flags.map(f => f.replaceAll('_',' ').toLowerCase()).join(', ') }}</p>
        <div v-if="canRequestExtension(room)" class="grid gap-2 text-sm"><p v-if="room.extensionRequest">Extension awaiting Staff approval: {{ format(room.extensionRequest.expiresAt) }} — {{ room.extensionRequest.reason }}. The current deadline still applies.</p><p>One extension of up to 24 hours is allowed, capped at setup start.</p><label :for="`extension-deadline-${room.id}`">Requested deadline ({{ data.event.timeZone }})</label><Input :id="`extension-deadline-${room.id}`" v-model="extensionDates[room.id]" type="datetime-local" :disabled="!ready || Boolean(posting)" /><label :for="`extension-reason-${room.id}`">Extension request reason</label><Input :id="`extension-reason-${room.id}`" v-model="extensionReasons[room.id]" :disabled="!ready || Boolean(posting)" /><Button size="sm" variant="outline" class="w-fit" :disabled="!ready || Boolean(posting) || !extensionDates[room.id] || !extensionReasons[room.id]?.trim()" @click="requestExtension(room)">Request hold extension</Button></div>
        <p v-else-if="room.extensionCount" class="text-sm">The one permitted hold extension has been used.</p>
        <p v-if="room.effectiveStatus==='EXPIRED'&&pendingReplacement(room)" class="text-sm">This replacement hold expired. Use Find replacement on the affected original booking to request a freshly reviewed alternative.</p>
        <div v-if="canReview && !['CANCELLED','REPLACED'].includes(room.status)" class="flex flex-wrap gap-2"><Button v-if="room.effectiveStatus==='EXPIRED'&&!pendingReplacement(room)" size="sm" :disabled="!ready||Boolean(posting)" @click="findAlternatives(room,'resubmit')">Resubmit expired hold</Button><Button v-else-if="room.flags.includes('AFFECTED_UNAVAILABLE') && !room.replacementBookingId && room.effectiveStatus!=='EXPIRED'" size="sm" :disabled="!ready||Boolean(posting)" @click="findAlternatives(room,'replacement')">Find replacement</Button><Button v-else-if="!room.replacementBookingId && room.effectiveStatus!=='EXPIRED'" size="sm" variant="outline" :disabled="!ready||Boolean(posting)" @click="findAlternatives(room)">Find alternatives</Button><Button size="sm" variant="outline" :disabled="!ready||Boolean(posting)" @click="releaseError='';cancelRoom=room">{{ pendingReplacement(room)?'Withdraw replacement':'Cancel this booking' }}</Button></div>
        <div v-if="room.replacementBookingId" class="replacement-comparison grid gap-3 rounded-xl border p-3 sm:grid-cols-2"><p>Original: {{ room.venueName }} — Affected</p><p>Replacement: {{ data.items.find(item=>item.id===room.replacementBookingId)?.venueName }} — awaiting fresh Staff approval. Withdraw the pending replacement before Staff can restore the original.</p></div><p v-if="room.originalBookingId" class="text-sm">Replacement for booking {{ room.originalBookingId }}</p>

      </Card>
      <form v-if="open && canReview" class="grid gap-5 rounded-[18px] border border-border p-5 md:p-6" @submit.prevent="search">
        <h3 class="text-lg font-semibold">{{ sourceRoom ? `Alternatives for ${sourceRoom.venueName || sourceRoom.venueId}` : 'Find a venue for this room' }}</h3><p class="text-sm text-muted-foreground">Times must fit within the event. Availability is checked again when you request the room.</p><p v-if="sourceRoom && !canChangeSource" class="text-sm">This booking is retained. Review suitable alternatives with Venue Staff before arranging a replacement.</p>
        <div class="grid gap-4 sm:grid-cols-2"><label class="grid gap-1 text-sm">Room start ({{ data.event.timeZone }})<Input v-model="form.startAt" type="datetime-local" required /></label><label class="grid gap-1 text-sm">Room end ({{ data.event.timeZone }})<Input v-model="form.endAt" type="datetime-local" required /></label><label for="room-attendance" class="grid gap-1 text-sm">Room attendance<Input id="room-attendance" v-model.number="form.attendance" type="number" min="1" step="1" required /></label><label for="room-layout" class="grid gap-1 text-sm">Room layout<select id="room-layout" v-model="form.layout" required class="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"><option v-if="data.event.venueType === 'VIRTUAL'" value="VIRTUAL">No physical layout (virtual)</option><option v-for="option in options?.supportedLayouts ?? []" :key="option.value" :value="option.value">{{ option.label }}</option></select></label></div>
        <div class="grid gap-4 sm:grid-cols-2"><fieldset class="grid gap-2"><legend class="mb-2 text-sm font-medium">Required facilities</legend><label v-for="option in options?.facilities ?? []" :key="option.value" class="flex gap-2 text-sm"><input v-model="form.facilities" type="checkbox" :value="option.value" />{{ option.label }}</label></fieldset><fieldset class="grid gap-2"><legend class="mb-2 text-sm font-medium">Accessibility needs</legend><label v-for="option in options?.accessibilityTags ?? []" :key="option.value" class="flex gap-2 text-sm"><input v-model="form.accessibility" type="checkbox" :value="option.value" />{{ option.label }}</label></fieldset></div>
        <p v-if="data.event.venueRequirements" class="text-sm">Event venue notes: {{ data.event.venueRequirements }}</p><label class="grid gap-1 text-sm">Location<Input v-model="form.location" placeholder="Venue name or address" /></label><Button type="submit" class="w-fit" :disabled="!ready || loading || Boolean(posting)">{{ loading ? 'Searching…' : 'Search available venues' }}</Button><p v-if="message" role="alert" class="text-sm text-destructive">{{ message }}</p>
        <template v-if="matches"><p v-if="!matches.length" class="text-sm">No suitable available venues match these requirements.</p><label v-else-if="!sourceRoom || canChangeSource" for="room-request-reason" class="grid gap-1 text-sm">{{ sourceRoom ? 'Change reason' : 'Request reason' }}<Input id="room-request-reason" v-model="form.reason" placeholder="Describe the use of this room" /></label><Card v-for="venue in matches" :key="venue.id" class="venue-search-result grid gap-3 rounded-xl border border-border !bg-transparent p-4 !shadow-none !ring-0"><h4 class="font-medium">{{ venue.name }}</h4><p class="text-sm">{{ venue.match === 'FULL' ? 'Full match' : 'Partial match' }} · Capacity {{ venue.capacity ?? '—' }} · {{ venue.address || 'Virtual venue' }}</p><p class="text-sm text-muted-foreground">Setup {{ venue.setupMinutes }} min · Turnaround {{ venue.turnaroundMinutes }} min · Occupied {{ format(venue.occupiedStart) }}–{{ format(venue.occupiedEnd) }}</p><p v-if="venue.gaps.length" class="text-sm text-destructive">Unmet requirements: {{ venue.gaps.join(', ') }}</p><Button v-if="!sourceRoom || canChangeSource" type="button" size="sm" class="w-fit" :disabled="!ready || Boolean(posting) || !venue.canRequest || !form.reason.trim()" @click="request(venue)">{{ posting === venue.id ? 'Saving…' : sourceRoom ? searchMode==='replacement'?'Request replacement':searchMode==='resubmit'?'Submit fresh hold':'Change this booking' : 'Request this venue' }}</Button></Card></template>
      </form>
      <ConfirmationDialog v-if="cancelRoom" label="Confirm booking cancellation" :busy="Boolean(posting)" @dismiss="cancelRoom=null"><h3 class="font-semibold">{{ pendingReplacement(cancelRoom)?'Withdraw pending replacement':'Cancel this venue booking' }}</h3><p v-if="lastVenue" class="warning text-destructive">This Event will have no venue. The Event itself and registrations will be retained.</p><p>Only this booking will be released. An approved arrangement requires recorded Coordinator review and current Safety before reconfirmation.</p><p v-if="releaseError" role="alert" class="text-sm text-destructive">{{ releaseError }}</p><label class="grid gap-1 text-sm">Cancellation reason<Input v-model="releaseReasons[cancelRoom.id]" :disabled="Boolean(posting)" autofocus maxlength="500" /></label><div class="flex gap-2"><Button variant="outline" :disabled="Boolean(posting)" @click="cancelRoom=null">Keep booking</Button><Button :disabled="Boolean(posting)||!releaseReasons[cancelRoom.id]?.trim()" @click="release(cancelRoom)">Confirm cancellation</Button></div></ConfirmationDialog>
    </template>
  </section>
</template>
