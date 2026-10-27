<script setup lang="ts">
const requestFetch=useRequestFetch()
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { apiErrorMessage } from '../shared/api-error'
const props=defineProps<{requestId:string,eventId?:string,insideTabs?:boolean}>()
interface Entry {id:string,action:string,actorType:string,actorId:string|null,createdAt:string,fromStatus:string|null,toStatus:string|null,details?:{actorName?:string,note?:string,reason?:string,bookingId?:string,changes?:Record<string,{old:unknown,new:unknown}>,previousValues?:Record<string,unknown>}}
const items=ref<Entry[]>([]),cursor=ref<string|null>(null),loading=ref(false),error=ref(''),loaded=ref(false)
const path=props.eventId?`/api/event-history/${props.eventId}`:`/api/events/${props.requestId}/activity`
async function load(more=false){
 if(loading.value)return
 loading.value=true;error.value=''
 try{const result=await requestFetch<{items:Entry[],nextCursor:string|null}>(path,{query:more&&cursor.value?{cursor:cursor.value}:{}});items.value=more?[...items.value,...result.items]:result.items;cursor.value=result.nextCursor;loaded.value=true}
 catch(e){error.value=apiErrorMessage(e,'History is unavailable. Please retry.')}
 finally{loading.value=false}
}
const actionLabels:Record<string,string>={CANCELLATION_ACCEPTED:'Event cancellation accepted',VenueCancellationReleased:'Venue released — cancellation pending',VENUE_CHANGE_REVIEWED:'Venue change reviewed',VenueCancelled:'Venue booking cancelled',VenueBookingChanged:'Venue booking changed',VenueRequested:'Venue booking requested',VenueBookingApproved:'Venue booking approved',VenueBookingRejected:'Venue booking rejected',VenueUnavailable:'Venue affected by unavailability',VenueBookingRestored:'Venue booking restored',VenueReplacementApproved:'Replacement venue approved',VenueHoldExpiring:'Hold warning',VenueHoldExpired:'Hold expired'}
function actionLabel(action:string){return actionLabels[action]||action.replaceAll('_',' ')}
function value(v:unknown){return v===null||v===''?'Empty':typeof v==='string'?v:JSON.stringify(v)}
onMounted(()=>load())
</script>
<template>
 <Card :role="insideTabs ? undefined : 'tabpanel'" :aria-label="insideTabs ? undefined : 'Activity history'" class="gap-0 rounded-[18px] border border-border !bg-transparent py-0 !shadow-none !ring-0">
  <CardHeader class="px-5 py-5 md:px-6">
   <CardTitle class="text-xl font-semibold tracking-tight">Activity history</CardTitle>
   <CardDescription>A chronological record of the request and its review decisions.</CardDescription>
  </CardHeader>
  <CardContent class="border-t border-border px-5 py-5 md:px-6">
  <p v-if="loading" role="status" class="text-sm text-muted-foreground">Loading activity…</p>
  <div v-if="error" role="alert" class="text-sm text-destructive">{{ error }} <Button variant="link" class="h-auto px-1 py-0 align-baseline text-destructive" @click="load()">Retry history</Button></div>
  <p v-else-if="loaded&&!items.length" role="status" class="text-sm text-muted-foreground">No activity recorded yet.</p>
  <ol aria-label="History entries, newest first" class="grid gap-3">
   <li v-for="entry in items" :key="entry.id">
    <details class="rounded-xl border border-border px-4 py-3 transition-colors hover:bg-muted/20" data-testid="history-entry">
     <summary class="cursor-pointer list-none text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><span class="font-medium">{{ actionLabel(entry.action) }}</span><span class="text-muted-foreground"> · {{ entry.actorType==='SYSTEM'?'System':entry.details?.actorName || entry.actorId }} · <time :datetime="entry.createdAt">{{ new Date(entry.createdAt).toLocaleString() }}</time></span></summary>
     <div class="mt-3 border-t border-border pt-3">
      <p v-if="entry.fromStatus!==entry.toStatus" class="text-sm">{{ entry.fromStatus ?? 'New' }} → {{ entry.toStatus }}</p>
      <p v-if="entry.details?.bookingId" class="mt-2 break-all text-xs text-muted-foreground">Booking {{ entry.details.bookingId }}</p>
      <p v-if="entry.details?.reason" class="mt-2 whitespace-pre-wrap text-sm">{{ entry.details.reason }}</p>
      <p v-if="entry.details?.note" class="mt-2 whitespace-pre-wrap text-sm">{{ entry.details.note }}</p>
      <dl v-if="entry.details?.changes" class="mt-3 grid gap-3">
       <div v-for="(change,field) in entry.details.changes" :key="field" class="text-sm"><dt class="font-medium">{{ field }}</dt><dd class="mt-0.5 break-words whitespace-pre-wrap text-muted-foreground">{{ value(change.old) }} → {{ value(change.new) }}</dd></div>
      </dl>
     </div>
    </details>
   </li>
  </ol>
  <Button v-if="cursor" type="button" variant="outline" class="mt-5" :disabled="loading" @click="load(true)">Load older activity</Button>
  </CardContent>
 </Card>
</template>
