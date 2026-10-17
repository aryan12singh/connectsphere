<script setup lang="ts">
import { computed,onMounted,ref,watch } from 'vue'
import { Button } from '@/components/ui/button'
import { isSafetyArea,reworkIsReady,safetyAreas } from './safety-review-state'
import type { ReworkArrangement,SafetyFeedback } from './safety-review-state'
const props=withDefaults(defineProps<{audience?:'COORDINATOR'|'ORGANISER';feedback:SafetyFeedback | null;arrangements:ReworkArrangement[];currentRequirementsRevision:string;readinessRequirementsRevision:string;coordinatorReviewRevision?:string;coordinatorReviewRoundId?:string;canViewFeedback?:boolean;canResubmit?:boolean;pending?:boolean;requestError?:string}>(),{audience:'COORDINATOR',canViewFeedback:false,canResubmit:false,pending:false,requestError:''})
const emit=defineEmits<{resubmit:[value:{previousRoundId:string;previousRound:number;requirementsRevision:string}]}>()
const ready=ref(false),issued=ref(false)
onMounted(()=>{ready.value=true})
const currentProof=computed(()=>typeof props.currentRequirementsRevision==='string' && Boolean(props.currentRequirementsRevision.trim()) && props.readinessRequirementsRevision===props.currentRequirementsRevision)
const reviewed=computed(()=>currentProof.value && props.coordinatorReviewRevision===props.currentRequirementsRevision && props.coordinatorReviewRoundId===props.feedback?.roundId)
const permitted=computed(()=>ready.value && props.audience==='COORDINATOR' && props.canViewFeedback===true && props.canResubmit===true && !props.pending && !issued.value
  && Boolean(props.feedback && typeof props.feedback.roundId==='string' && props.feedback.roundId.trim()) && Number.isSafeInteger(props.feedback?.round) && (props.feedback?.round ?? 0)>0
  && reviewed.value && reworkIsReady(props.feedback,props.arrangements))
const affected=(area:string)=>props.feedback?.affectedAreas?.includes(area) ?? false
const label=(area:string)=>isSafetyArea(area)?safetyAreas[area]:'Unverified area'
watch(()=>[props.feedback?.roundId,props.feedback?.round,props.currentRequirementsRevision,props.canViewFeedback,props.canResubmit,props.coordinatorReviewRevision,props.coordinatorReviewRoundId],()=>{issued.value=false})
watch(()=>[props.pending,props.requestError] as const,([pending,error],[wasPending,oldError])=>{if(error && !pending && (wasPending || error!==oldError))issued.value=false})
function resubmit(){
  if(!permitted.value || !props.feedback)return
  issued.value=true
  emit('resubmit',{previousRoundId:props.feedback.roundId,previousRound:props.feedback.round,requirementsRevision:props.currentRequirementsRevision})
}
function readinessLabel(item:ReworkArrangement) {
  if(affected(item.area))return !currentProof.value?'Readiness not verified':!reviewed.value?'Coordinator review required':item.ready===true?'Current readiness verified':'Coordinator action outstanding'
  return item.ready===true?'Approval retained':'Readiness not verified'
}
</script>
<template>
  <section v-if="props.canViewFeedback === true && props.feedback" aria-label="Safety rework" class="grid gap-4 rounded-2xl border border-border p-5">
    <h2 class="text-xl font-semibold">Safety rework</h2>
    <p class="text-sm">Review round {{ props.feedback.round }} · {{ props.feedback.decision === 'REJECT' ? 'Venue safety arrangement rejected' : 'Changes requested' }}</p>
    <p class="whitespace-pre-wrap break-words text-sm">{{ props.feedback.reason }}</p>
    <template v-if="props.audience === 'COORDINATOR'">
    <p class="text-sm">The Event remains in Planning. The Coordinator reviews the feedback and decides which changes are necessary. Venue and equipment approvals are not reset automatically.</p>
    <p v-if="!reviewed" class="text-sm">Coordinator review required for this round and current requirements.</p>
    <ul class="grid gap-2"><li v-for="(item,index) in props.arrangements" :key="index" :data-rework-area="item.area" class="rounded-xl bg-muted p-3 text-sm"><span class="font-medium">{{ label(item.area) }} · {{ item.label }}</span><span class="ml-2">{{ readinessLabel(item) }}</span></li></ul>
    <p v-if="!currentProof || !reworkIsReady(props.feedback,props.arrangements)" class="text-sm text-muted-foreground">Current readiness is required after the Coordinator has reviewed the affected arrangements.</p>
    <p v-if="!props.canResubmit" class="text-sm text-muted-foreground">Safety resubmission is not available yet.</p>
    <p v-if="props.requestError" role="alert" class="text-sm text-destructive">{{ props.requestError }}</p>
    <Button type="button" :disabled="!permitted" @click="resubmit">{{ props.pending ? 'Resubmitting…' : 'Resubmit for Safety Check' }}</Button>
    </template>
  </section>
</template>
