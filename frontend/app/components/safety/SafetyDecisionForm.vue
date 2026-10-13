<script setup lang="ts">
import { computed,onMounted,reactive,ref,useId,watch } from 'vue'
import { Button } from '@/components/ui/button'
import { currentSafetyRound,safetyAreas,validateSafetyDecision } from './safety-review-state'
import type { SafetyDecisionIntent,SafetyRound } from './safety-review-state'
const props=withDefaults(defineProps<{round:SafetyRound | null;currentRequirementsRevision:string;canDecide?:boolean;pending?:boolean;requestError?:string}>(),{canDecide:false,pending:false,requestError:''})
const emit=defineEmits<{decision:[value:SafetyDecisionIntent]}>()
const form=reactive({decision:'',reason:'',areas:[] as string[]}),errors=ref<Record<string,string>>({})
const ready=ref(false),issued=ref(false),id=useId()
onMounted(()=>{ready.value=true})
const permitted=computed(()=>ready.value && props.canDecide===true && currentSafetyRound(props.round,props.currentRequirementsRevision) && !props.pending && !issued.value)
function clearDraft(){form.decision='';form.reason='';form.areas=[];errors.value={};issued.value=false}
watch(()=>[props.round?.id,props.round?.number,props.round?.requirementsRevision,props.currentRequirementsRevision,props.canDecide],clearDraft)
watch(()=>[props.pending,props.requestError] as const,([pending,error],[wasPending,oldError])=>{if(error && !pending && (wasPending || error!==oldError))issued.value=false})
watch(()=>form.decision,()=>{form.areas=[];errors.value={}})
function submit() {
  if(!permitted.value)return
  const result=validateSafetyDecision(form,props.round,props.currentRequirementsRevision)
  errors.value=result.errors
  if(!result.value)return
  issued.value=true
  emit('decision',result.value)
}
</script>
<template>
  <form aria-label="Safety decision" class="grid gap-4" novalidate @submit.prevent="submit">
    <p class="text-sm">{{ props.round ? `Review round ${props.round.number}` : 'The current review is unavailable.' }}</p>
    <p v-if="!props.canDecide" class="text-sm text-muted-foreground">Safety decisions are available only to an authorized Safety Officer.</p>
    <p v-else-if="!currentSafetyRound(props.round,props.currentRequirementsRevision)" role="alert" class="text-sm text-destructive">This review is out of date. Refresh before deciding.</p>
    <label :for="`${id}-decision`" class="grid gap-1 text-sm">Safety decision<select :id="`${id}-decision`" v-model="form.decision" :disabled="!permitted" :aria-invalid="Boolean(errors.decision)" class="h-10 rounded-xl border border-border px-3"><option value="">Choose a decision</option><option value="APPROVE">Approve</option><option value="REJECT">Reject</option><option value="REQUEST_CHANGES">Request Changes</option></select></label>
    <label :for="`${id}-reason`" class="grid gap-1 text-sm">Reason {{ form.decision === 'APPROVE' ? '(optional)' : '(required for Reject or Request Changes)' }}<textarea :id="`${id}-reason`" v-model="form.reason" :disabled="!permitted" :aria-invalid="Boolean(errors.reason)" rows="3" class="rounded-xl border border-border p-3" /></label>
    <fieldset v-if="form.decision === 'REQUEST_CHANGES'" :disabled="!permitted" class="grid gap-2"><legend class="mb-2 text-sm font-medium">Affected areas (select at least one)</legend><label v-for="(label,area) in safetyAreas" :key="area" class="flex items-center gap-2 text-sm"><input v-model="form.areas" type="checkbox" :value="area" />{{ label }}</label></fieldset>
    <ul v-if="Object.keys(errors).length" role="alert" class="list-disc pl-5 text-sm text-destructive"><li v-for="(message,key) in errors" :key="key">{{ message }}</li></ul>
    <p v-if="props.requestError" role="alert" class="text-sm text-destructive">{{ props.requestError }}</p>
    <Button type="submit" :disabled="!permitted">{{ props.pending ? 'Saving…' : 'Record Safety decision' }}</Button>
  </form>
</template>
