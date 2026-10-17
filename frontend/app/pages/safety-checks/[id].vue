<script setup lang="ts">
import {ref} from 'vue'
import SafetyReviewDetails from '@/components/safety/SafetyReviewDetails.vue'
import SafetyDecisionForm from '@/components/safety/SafetyDecisionForm.vue'
import type {SafetySnapshot,SafetyDecisionIntent} from '@/components/safety/safety-review-state'
definePageMeta({permission:'safety.view'})
const route=useRoute(),id=String(route.params.id),{can}=usePermissions()
const {data,error,refresh}=await useFetch<{id:string;number:number;requirementsRevision:string;current:boolean;status:string;history:{id:string,number:number,status:string,changes:string[],decision:{reason:string}|null}[];snapshot:SafetySnapshot;event:{title:string};decision:{outcome:string;reason:string;privateNotes:string}|null}>(()=>`/api/safety/rounds/${encodeURIComponent(id)}`)
useHead({title:'Operational Safety Check | ConnectSphere'})
const pending=ref(false),requestError=ref(''),saved=ref(false)
let lastBody='',lastKey=''
async function decide(value:SafetyDecisionIntent){
 if(pending.value)return
 pending.value=true;requestError.value='';saved.value=false
 const encoded=JSON.stringify(value);if(encoded!==lastBody){lastBody=encoded;lastKey=crypto.randomUUID()}
 try{await $fetch(`/api/safety/rounds/${encodeURIComponent(id)}/decision`,{method:'POST',body:value,headers:{'idempotency-key':lastKey}});saved.value=true;await refresh()}
 catch(caught:any){requestError.value=caught?.data?.data?.error?.message||caught?.data?.error?.message||'Unable to record the decision. Refresh and retry.';await refresh()}
 finally{pending.value=false}
}
</script>
<template><main class="mx-auto grid max-w-6xl gap-6 px-5 py-8"><NuxtLink to="/safety-checks" class="underline">Pending Safety Checks</NuxtLink><h1 class="text-3xl font-semibold">Operational Safety Check</h1><p v-if="error" role="alert">This review is unavailable or you do not have access.</p><template v-if="data"><h2 class="text-xl font-semibold">{{ data.snapshot.eventTitle }}</h2><SafetyReviewDetails :snapshot="data.snapshot" /><section v-if="data.history.length>1" class="grid gap-3 rounded-2xl border p-5" aria-label="Safety round history"><h2 class="text-xl font-semibold">Review history and changes</h2><div v-for="round in data.history" :key="round.id"><NuxtLink :to="`/safety-checks/${round.id}`" class="underline">Round {{ round.number }} · {{ round.status.toLowerCase().replaceAll('_',' ') }}</NuxtLink><p v-if="round.changes.length" class="text-sm">Changed factors: {{ round.changes.join(', ') }}</p><p v-if="round.decision?.reason" class="whitespace-pre-wrap text-sm">{{ round.decision.reason }}</p></div></section><p v-if="saved" role="status">Decision saved.</p><p v-if="!data.current" role="status">This round is {{ data.status.toLowerCase().replaceAll('_',' ') }}. Its submitted evidence is retained.</p><div v-if="data.decision" class="grid gap-2 rounded-2xl border border-border p-5"><p class="font-medium">{{ data.decision.outcome }}</p><p class="whitespace-pre-wrap">{{ data.decision.reason }}</p><p v-if="data.decision.privateNotes" class="whitespace-pre-wrap text-sm text-muted-foreground">Private internal notes: {{ data.decision.privateNotes }}</p></div><SafetyDecisionForm v-if="data.current" :round="{id:data.id,number:data.number,requirementsRevision:data.requirementsRevision}" :current-requirements-revision="data.requirementsRevision" :can-decide="can('safety.decide') && data.current" :venues="data.snapshot.venues" :pending="pending" :request-error="requestError" @decision="decide" /></template><p v-if="requestError" role="alert" class="text-sm text-destructive">{{ requestError }}</p></main></template>
