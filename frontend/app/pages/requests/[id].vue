<script setup lang="ts">
const requestFetch=useRequestFetch()
import { computed,onMounted,ref } from 'vue'
import { emptyRequestForm,formToPayload,recordToForm } from '@/components/request-form-state'
import { operationIntent,fieldErrors as extractFields } from '@/components/request-errors'
import { apiErrorMessage } from '@/components/shared/api-error'
import { REQUEST_STATUS_LABELS } from '@/components/status-labels'
const route=useRoute(),id=String(route.params.id ?? '')
const {data:record,error:recordError}=await useFetch(`/api/events/${id}`,{key:`event-request-${id}`})
const loaded=computed(()=>record.value as Record<string,any>|null)
const {data:coordinator}=await useFetch(`/api/events/${id}/coordinator`,{key:`event-coordinator-${id}`})
const {user}=useUserSession(),editMode=ref(false),isSubmitting=ref(false),submitError=ref(''),savedMessage=ref(''),fieldErrors=ref<Record<string,string[]>>({})
const canEdit=computed(()=>loaded.value?.organiserId===user.value?.id && ['DRAFT','RETURNED_FOR_AMENDMENT'].includes(loaded.value?.status))
const mode=computed(()=>canEdit.value&&loaded.value?.status==='DRAFT'?'draft':canEdit.value&&editMode.value?'edit':'readonly')
const form=ref(loaded.value?recordToForm(loaded.value):emptyRequestForm()),clean=ref(JSON.stringify(form.value))
const dirty=computed(()=>JSON.stringify(form.value)!==clean.value);useUnsavedRequest(dirty)
const intent=operationIntent(),tab=ref<'details'|'history'>('details'),historyRevision=ref(0)
const detailsTab=ref<HTMLButtonElement|null>(null),historyTab=ref<HTMLButtonElement|null>(null)
const tabsReady=ref(false)
onMounted(()=>{tabsReady.value=true})
function navigateTabs(event:KeyboardEvent){
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
 event.preventDefault()
 tab.value=event.key==='Home'?'details':event.key==='End'?'history':tab.value==='details'?'history':'details'
 ;(tab.value==='details'?detailsTab.value:historyTab.value)?.focus()
}
async function save(submit:boolean){
 if(isSubmitting.value||!canEdit.value)return
 isSubmitting.value=true;submitError.value='';fieldErrors.value={};savedMessage.value=''
 const action=submit?(loaded.value?.status==='DRAFT'?'submit':'resubmit'):'save'
 const body=formToPayload(form.value,{version:loaded.value?.version,...(action==='submit'?{submit:true}:action==='resubmit'?{action:'resubmit'}:{})})
 const operationKey=intent.keyFor(body)
 try{
  const result=await requestFetch(`/api/events/${id}`,{method:'PUT',body:{...body,operationKey}})
  record.value=result as typeof record.value;clean.value=JSON.stringify(form.value);intent.clear();editMode.value=false;historyRevision.value++
  savedMessage.value=submit?`Request ${id} submitted for review.`:'Changes saved.'
  await refreshNuxtData([`event-coordinator-${id}`,'organiser-events'])
 }catch(e){submitError.value=apiErrorMessage(e,'Could not save. Your entries are kept; retry safely.');fieldErrors.value=extractFields(e)}
 finally{isSubmitting.value=false}
}
useHead({title:'Event request | ConnectSphere'})
</script>
<template>
 <main class="mx-auto w-full max-w-[90rem] px-5 pb-32 pt-6 md:px-8 md:py-8 lg:pb-8">
  <NuxtLink to="/" class="underline">My requests</NuxtLink>
  <p v-if="recordError" role="alert" class="mt-6 text-destructive">This request is unavailable. It may not exist or you may not have access to it.</p>
  <template v-else-if="loaded">
   <p class="mt-3 break-all text-sm text-muted-foreground">Request ID: {{ loaded.id }} · Version {{ loaded.version }}</p>
   <p v-if="loaded.eventId" class="mt-2 text-sm">Event ID: <NuxtLink :to="`/events/${loaded.eventId}`" class="underline">{{ loaded.eventId }} · Event history</NuxtLink></p>
   <p v-if="loaded.awaitingAssignment" role="status" class="mt-2">Awaiting assignment</p>
   <p v-if="savedMessage" role="status" class="mt-3">{{ savedMessage }}</p>
   <div role="tablist" aria-label="Request details and history" class="mt-4 flex gap-5" @keydown="navigateTabs">
    <button id="request-details-tab" ref="detailsTab" type="button" role="tab" aria-controls="request-details-panel" :disabled="!tabsReady" :tabindex="tab==='details'?0:-1" :aria-selected="tab==='details'" @click="tab='details'">Details</button>
    <button id="request-history-tab" ref="historyTab" type="button" role="tab" aria-controls="request-history-panel" :disabled="!tabsReady" :tabindex="tab==='history'?0:-1" :aria-selected="tab==='history'" @click="tab='history'">History</button>
   </div>
   <RequestActivityHistory v-if="tab==='history'" id="request-history-panel" aria-labelledby="request-history-tab" :key="historyRevision" :request-id="id" />
   <div v-else id="request-details-panel" role="tabpanel" aria-labelledby="request-details-tab">
    <RequestFormPage v-model="form" :title="loaded.eventName || 'Untitled draft'" :status-label="loaded.statusLabel ?? REQUEST_STATUS_LABELS[loaded.status] ?? loaded.status" :banner="coordinator as any" :disabled="mode==='readonly'" :is-submitting="isSubmitting" :submit-error="submitError" :field-errors="fieldErrors" :mode="mode" :can-edit="canEdit" :return-comments="loaded.decisionReason ?? ''" @save="save(false)" @submit="save(true)" @edit="editMode=true" />
   </div>
  </template>
  <p v-else class="mt-6">Loading request…</p>
 </main>
</template>
