<script setup lang="ts">
import { computed,onMounted,ref,watch } from 'vue'
import { Button } from '@/components/ui/button'
import { isSafetyArea,reworkIsReady,safetyAreas } from './safety-review-state'
import type { ReworkArrangement,SafetyFeedback } from './safety-review-state'
const props=withDefaults(defineProps<{feedback:SafetyFeedback | null;arrangements:ReworkArrangement[];currentRequirementsRevision:string;readinessRequirementsRevision:string;canViewFeedback?:boolean;canResubmit?:boolean;pending?:boolean;requestError?:string}>(),{canViewFeedback:false,canResubmit:false,pending:false,requestError:''})
const emit=defineEmits<{resubmit:[value:{previousRoundId:string;previousRound:number;requirementsRevision:string}]}>()
const ready=ref(false),issued=ref(false)
onMounted(()=>{ready.value=true})
const currentProof=computed(()=>typeof props.currentRequirementsRevision==='string' && Boolean(props.currentRequirementsRevision.trim()) && props.readinessRequirementsRevision===props.currentRequirementsRevision)
const permitted=computed(()=>ready.value && props.canViewFeedback===true && props.canResubmit===true && !props.pending && !issued.value
  && Boolean(props.feedback && typeof props.feedback.roundId==='string' && props.feedback.roundId.trim()) && Number.isSafeInteger(props.feedback?.round) && (props.feedback?.round ?? 0)>0
  && currentProof.value && reworkIsReady(props.feedback,props.arrangements))
const affected=(area:string)=>props.feedback?.affectedAreas?.includes(area) ?? false
const label=(area:string)=>isSafetyArea(area)?safetyAreas[area]:'Unverified area'
watch(()=>[props.feedback?.roundId,props.feedback?.round,props.currentRequirementsRevision,props.canViewFeedback,props.canResubmit],()=>{issued.value=false})
watch(()=>[props.pending,props.requestError] as const,([pending,error],[wasPending,oldError])=>{if(error && !pending && (wasPending || error!==oldError))issued.value=false})
function resubmit(){
  if(!permitted.value || !props.feedback)return
  issued.value=true
  emit('resubmit',{previousRoundId:props.feedback.roundId,previousRound:props.feedback.round,requirementsRevision:props.currentRequirementsRevision})
}
function readinessLabel(item:ReworkArrangement) {
  if(affected(item.area))return !currentProof.value?'Readiness not verified':item.ready===true?'Rework approved':'Needs rework'
  return item.ready===true?'Approval retained':'Readiness not verified'
}
</script>
<template>
  <section v-if="props.canViewFeedback === true && props.feedback" aria-label="Safety rework" class="grid gap-4 rounded-2xl border border-border p-5">
    <h2 class="text-xl font-semibold">Safety rework</h2>
    <p class="text-sm">Review round {{ props.feedback.round }} · {{ props.feedback.decision === 'REJECT' ? 'Rejected' : 'Changes requested' }}</p>
    <p class="whitespace-pre-wrap break-words text-sm">{{ props.feedback.reason }}</p>
    <ul class="grid gap-2"><li v-for="(item,index) in props.arrangements" :key="index" :data-rework-area="item.area" class="rounded-xl bg-muted p-3 text-sm"><span class="font-medium">{{ label(item.area) }} · {{ item.label }}</span><span class="ml-2">{{ readinessLabel(item) }}</span></li></ul>
    <p v-if="!currentProof || !reworkIsReady(props.feedback,props.arrangements)" class="text-sm text-muted-foreground">Every affected area needs current approval before resubmission.</p>
    <p v-if="!props.canResubmit" class="text-sm text-muted-foreground">Safety resubmission is not available yet.</p>
    <p v-if="props.requestError" role="alert" class="text-sm text-destructive">{{ props.requestError }}</p>
    <Button type="button" :disabled="!permitted" @click="resubmit">{{ props.pending ? 'Resubmitting…' : 'Resubmit for Safety Check' }}</Button>
  </section>
</template>
