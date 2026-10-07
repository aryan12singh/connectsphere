<script setup lang="ts">
const requestFetch=useRequestFetch()
import { ref } from 'vue'
import { apiErrorMessage } from './shared/api-error'
const props=defineProps<{requestId:string,eventId?:string}>()
interface Entry {id:string,action:string,actorType:string,actorId:string|null,createdAt:string,fromStatus:string|null,toStatus:string|null,details?:{actorName?:string,note?:string,changes?:Record<string,{old:unknown,new:unknown}>,previousValues?:Record<string,unknown>}}
const items=ref<Entry[]>([]),cursor=ref<string|null>(null),loading=ref(false),error=ref(''),loaded=ref(false)
const path=props.eventId?`/api/event-history/${props.eventId}`:`/api/events/${props.requestId}/activity`
async function load(more=false){
 if(loading.value)return
 loading.value=true;error.value=''
 try{const result=await requestFetch<{items:Entry[],nextCursor:string|null}>(path,{query:more&&cursor.value?{cursor:cursor.value}:{}});items.value=more?[...items.value,...result.items]:result.items;cursor.value=result.nextCursor;loaded.value=true}
 catch(e){error.value=apiErrorMessage(e,'History is unavailable. Please retry.')}
 finally{loading.value=false}
}
function value(v:unknown){return v===null||v===''?'Empty':typeof v==='string'?v:JSON.stringify(v)}
onMounted(()=>load())
</script>
<template>
 <section role="tabpanel" aria-label="Activity history" class="mt-5 rounded-3xl border bg-card p-5">
  <h2 class="text-xl font-semibold">Activity history</h2>
  <p v-if="loading" role="status" class="mt-3">Loading activity…</p>
  <div v-if="error" role="alert" class="mt-3 text-destructive">{{ error }} <button class="underline" @click="load()">Retry history</button></div>
  <p v-else-if="loaded&&!items.length" role="status" class="mt-3">No activity recorded yet.</p>
  <ol aria-label="History entries, newest first" class="mt-4 grid gap-3">
   <li v-for="entry in items" :key="entry.id">
    <details class="rounded-xl border p-3" data-testid="history-entry">
     <summary class="cursor-pointer"><strong>{{ entry.action.replaceAll('_',' ') }}</strong> · {{ entry.actorType==='SYSTEM'?'System':entry.details?.actorName || entry.actorId }} · <time :datetime="entry.createdAt">{{ new Date(entry.createdAt).toLocaleString() }}</time></summary>
     <p v-if="entry.fromStatus!==entry.toStatus" class="mt-2 text-sm">{{ entry.fromStatus ?? 'New' }} → {{ entry.toStatus }}</p>
     <p v-if="entry.details?.note" class="mt-2 whitespace-pre-wrap text-sm">{{ entry.details.note }}</p>
     <dl v-if="entry.details?.changes" class="mt-3 grid gap-2">
      <div v-for="(change,field) in entry.details.changes" :key="field" class="text-sm"><dt class="font-medium">{{ field }}</dt><dd class="break-words whitespace-pre-wrap">{{ value(change.old) }} → {{ value(change.new) }}</dd></div>
     </dl>
    </details>
   </li>
  </ol>
  <button v-if="cursor" type="button" :disabled="loading" class="mt-4 underline" @click="load(true)">Load older activity</button>
 </section>
</template>
