<script setup lang="ts">
import {computed,onMounted,ref,watch} from 'vue'
const {can}=usePermissions()
const venue=computed(()=>can('venue_bookings.decide')),technical=computed(()=>can('technical.review'))
const {data:queue,error:queueError}=await useFetch<{items:{id:string,title:string,startAt:string}[]}>('/api/safety/preparation')
const eventId=ref(''),bookingId=ref(''),note=ref(''),area=ref('VENUE'),saving=ref(false),message=ref(''),ready=ref(false)
onMounted(()=>{ready.value=true;area.value=venue.value?'VENUE':'TECHNICAL'})
watch(queue,value=>{if(!eventId.value)eventId.value=value?.items[0]?.id||''},{immediate:true})
const {data:details,error,refresh}=await useFetch<{event:{title:string},venues:{bookingId:string,venueName:string}[],technical:{placementDetails:string}|null,updates:{id:string,area:string,bookingId:string|null,currentRound:boolean,note:string,occurredAt:string}[]}>(()=>`/api/safety/events/${encodeURIComponent(eventId.value||'none')}/preparation`,{watch:[eventId]})
watch(details,value=>{bookingId.value=value?.venues[0]?.bookingId||''})
let retryBody='',retryKey=''
async function save(){
 if(saving.value||!eventId.value||!note.value.trim())return
 const body={area:area.value,note:note.value.trim(),...(area.value==='VENUE'?{bookingId:bookingId.value}:{})},encoded=JSON.stringify([eventId.value,body])
 if(encoded!==retryBody){retryBody=encoded;retryKey=crypto.randomUUID()}
 saving.value=true;message.value=''
 try{await $fetch(`/api/safety/events/${encodeURIComponent(eventId.value)}/preparation-updates`,{method:'POST',body,headers:{'idempotency-key':retryKey}});message.value='Preparation update saved.';note.value='';retryBody='';await refresh()}
 catch(e:any){message.value=e?.data?.data?.error?.message||e?.data?.error?.message||'Unable to save. Refresh and retry.'}
 finally{saving.value=false}
}
useHead({title:'Staff preparation | ConnectSphere'})
</script>
<template><main class="mx-auto grid max-w-5xl gap-5 px-5 py-8"><h1 class="text-3xl font-semibold">Staff preparation</h1><p class="text-muted-foreground">Record setup progress after the Coordinator starts Preparation with current Safety approval.</p><p v-if="queueError" role="alert">Preparation queue is unavailable.</p><p v-else-if="!queue?.items.length" role="status">No Events are currently ready for Preparation.</p><template v-else><label class="grid gap-2">Event<select aria-label="Event" v-model="eventId" :disabled="!ready || saving" class="rounded-xl border bg-background p-3"><option v-for="item in queue.items" :key="item.id" :value="item.id">{{ item.title }}</option></select></label><p v-if="error" role="alert">Current preparation proof is unavailable. Refresh before continuing.</p><form v-if="details" class="grid gap-4 rounded-2xl border p-5" @submit.prevent="save"><h2 class="text-xl font-semibold">{{ details.event.title }}</h2><label v-if="venue && technical" class="grid gap-2">Area<select aria-label="Area" v-model="area" :disabled="!ready || saving" class="rounded-xl border bg-background p-3"><option>VENUE</option><option>TECHNICAL</option></select></label><label v-if="area==='VENUE'" class="grid gap-2">Required venue<select aria-label="Required venue" v-model="bookingId" :disabled="!ready || saving" required class="rounded-xl border bg-background p-3"><option v-for="room in details.venues" :key="room.bookingId" :value="room.bookingId">{{ room.venueName }}</option></select></label><p v-if="area==='TECHNICAL' && details.technical" class="whitespace-pre-wrap text-sm">{{ details.technical.placementDetails }}</p><label class="grid gap-2">Preparation update<textarea v-model="note" required maxlength="2000" class="min-h-28 rounded-xl border bg-background p-3" /></label><button :disabled="!ready || saving || !note.trim() || (area==='VENUE'&&!bookingId)" class="rounded-xl bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">Save preparation update</button><ul class="grid gap-3"><li v-for="update in details.updates" :key="update.id" class="rounded-xl bg-muted p-3"><p class="text-sm font-medium">{{ update.currentRound ? 'Current Safety round' : 'Previous Safety round' }} · {{ update.area }} · {{ new Date(update.occurredAt).toLocaleString() }}</p><p v-if="update.bookingId" class="text-sm">{{ details.venues.find(v=>v.bookingId===update.bookingId)?.venueName || update.bookingId }}</p><p class="whitespace-pre-wrap">{{ update.note }}</p></li></ul></form></template><p v-if="message" role="status">{{ message }}</p></main></template>
