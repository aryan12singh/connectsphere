<script setup lang="ts">
import {ref,onMounted} from 'vue'
const props=defineProps<{venueId:string}>(),emit=defineEmits<{recovered:[]}>()
const {data,refresh}=await useFetch<{operation:{id:string;kind:string;startedAt:string}|null}>(()=>`/api/venues/${encodeURIComponent(props.venueId)}/maintenance`,{watch:[()=>props.venueId]})
const ready=ref(false),pending=ref(false),message=ref('')
onMounted(()=>{ready.value=true})
async function act(action:'resume'|'cancel'){
 if(!data.value?.operation||pending.value)return
 pending.value=true;message.value=''
 try{const result=await $fetch<any>(`/api/venues/${encodeURIComponent(props.venueId)}/maintenance/${action}`,{method:'POST' as never,body:{operationId:data.value.operation.id}});await refresh();emit('recovered');message.value=action==='resume'?'Venue update reconciled.':result.completed?'The saved update already completed. Current venue refreshed.':'Uncommitted venue update cancelled. Refresh before editing.'}
 catch(e:any){message.value=e?.data?.data?.error?.message||e?.data?.error?.message||'The update is still uncertain. Refresh or retry the saved operation.';await refresh()}
 finally{pending.value=false}
}
</script>
<template><section v-if="data?.operation" class="my-4 grid gap-3 rounded-xl border border-amber-400 bg-amber-50 p-4 text-slate-900" aria-label="Pending venue update"><h2 class="font-semibold">A venue update needs reconciliation</h2><p class="text-sm">The saved update is {{ data.operation.kind.toLowerCase() }}. New venue approvals and Safety submissions remain blocked until it completes or is cancelled.</p><div class="flex flex-wrap gap-3"><button type="button" :disabled="!ready || pending" class="rounded-lg border px-3 py-2" @click="act('resume')">Retry saved update</button><button type="button" :disabled="!ready || pending" class="rounded-lg border px-3 py-2" @click="act('cancel')">Cancel uncommitted update</button></div><p v-if="message" role="status" class="text-sm">{{ message }}</p></section></template>
