<script setup lang="ts">
const requestFetch=useRequestFetch()
import { computed,onMounted,ref } from 'vue'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import RequestActivityHistory from '@/components/events/RequestActivityHistory.vue'
import CancellationPanel from '@/components/events/CancellationPanel.vue'
import ChangeProposalPanel from '@/components/events/ChangeProposalPanel.vue'
import CoordinatorEditPanel from '@/components/events/CoordinatorEditPanel.vue'
import RequestFormPage from '@/components/events/RequestFormPage.vue'
import { emptyRequestForm,formToPayload,recordToForm } from '@/components/events/request-form-state'
import { operationIntent,fieldErrors as extractFields } from '@/components/events/request-errors'
import { apiErrorMessage } from '@/components/shared/api-error'
import { REQUEST_STATUS_LABELS } from '@/components/events/status-labels'
const route=useRoute(),id=String(route.params.id ?? '')
const {data:record,error:recordError}=await useFetch(`/api/events/${id}`,{key:`event-request-${id}`})
const loaded=computed(()=>record.value as Record<string,any>|null)
const {data:coordinator}=await useFetch(`/api/events/${id}/coordinator`,{key:`event-coordinator-${id}`})
const {user}=useUserSession(),editMode=ref(false),isSubmitting=ref(false),submitError=ref(''),savedMessage=ref(''),fieldErrors=ref<Record<string,string[]>>({})
const canEdit=computed(()=>loaded.value?.organiserId===user.value?.id && ['DRAFT','RETURNED_FOR_AMENDMENT'].includes(loaded.value?.status))
const canManageTechnicalRequirements=computed(()=>user.value?.role==='EVENT_COORDINATOR'&&loaded.value?.currentCoordinatorId===user.value?.id)
const canCoordinatorEdit=computed(()=>canManageTechnicalRequirements.value&&(loaded.value?.status==='SUBMITTED'||(loaded.value?.status==='APPROVED'&&['ARRANGEMENT_PENDING','CONFIRMED','PREPARATION'].includes(loaded.value?.eventStatus))))
const canProposeChange=computed(()=>loaded.value?.status==='APPROVED'&&['ARRANGEMENT_PENDING','CONFIRMED','PREPARATION'].includes(loaded.value?.eventStatus)&&(canManageTechnicalRequirements.value||loaded.value?.organiserId===user.value?.id))
async function afterChangeDecided(){await refreshNuxtData(`event-request-${id}`);historyRevision.value++}
const canCancel=computed(()=>loaded.value?.status==='APPROVED'&&['ARRANGEMENT_PENDING','CONFIRMED','PREPARATION','CANCELLING','CANCELLED'].includes(loaded.value?.eventStatus)&&(canManageTechnicalRequirements.value||loaded.value?.organiserId===user.value?.id))
async function afterCoordinatorEdit(result:Record<string,any>){record.value=result as typeof record.value;form.value=recordToForm(result);clean.value=JSON.stringify(form.value);historyRevision.value++}
const mode=computed(()=>canEdit.value&&loaded.value?.status==='DRAFT'?'draft':canEdit.value&&editMode.value?'edit':'readonly')
const form=ref(loaded.value?recordToForm(loaded.value):emptyRequestForm()),clean=ref(JSON.stringify(form.value))
const dirty=computed(()=>JSON.stringify(form.value)!==clean.value);useUnsavedRequest(dirty)
const intent=operationIntent(),tab=ref<'details'|'history'>('details'),historyRevision=ref(0)
const tabsReady=ref(false)
onMounted(()=>{tabsReady.value=true})
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
 <main class="mx-auto w-full max-w-5xl px-5 pb-32 pt-6 md:px-8 md:py-10 lg:pb-10">
  <Button as-child variant="ghost" class="-ml-3 h-9 !text-muted-foreground hover:!text-foreground"><NuxtLink to="/">My requests</NuxtLink></Button>
  <Alert v-if="recordError" variant="destructive" class="mt-6"><p class="col-start-2">This request is unavailable. It may not exist or you may not have access to it.</p></Alert>
  <template v-else-if="loaded">
   <header class="mt-5">
    <div class="flex flex-wrap items-center gap-3">
     <h1 class="text-3xl font-semibold tracking-tight md:text-4xl">{{ loaded.eventName || 'Untitled draft' }}</h1>
     <Badge variant="secondary">{{ loaded.statusLabel ?? REQUEST_STATUS_LABELS[loaded.status] ?? loaded.status }}</Badge>
    </div>
    <p class="mt-2 break-all text-sm text-muted-foreground">Request ID: {{ loaded.id }} · Version {{ loaded.version }}</p>
    <div class="mt-4 flex flex-wrap items-center gap-2">
     <Badge v-if="loaded.awaitingAssignment" variant="outline" class="font-normal text-muted-foreground">Awaiting assignment</Badge>
     <Button v-if="loaded.eventId" as-child variant="outline" size="sm"><NuxtLink :to="`/events/${loaded.eventId}`">View Event history</NuxtLink></Button>
     <Button v-if="canManageTechnicalRequirements" as-child variant="outline" size="sm"><NuxtLink :to="`/technical-requirements/${id}`">Manage technical requirements</NuxtLink></Button>
    </div>
   </header>

   <p v-if="savedMessage" role="status" class="mt-5 rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-sm text-success">{{ savedMessage }}</p>

   <CoordinatorEditPanel v-if="canCoordinatorEdit" class="mt-6" :key="loaded.version" :request-id="id" :description="loaded.description ?? ''" :version="loaded.version" @saved="afterCoordinatorEdit" />

   <ChangeProposalPanel v-if="canProposeChange" class="mt-6" :request-id="id" :version="loaded.version" :is-coordinator="canManageTechnicalRequirements" :is-organiser="loaded.organiserId===user?.id" @decided="afterChangeDecided" />

   <CancellationPanel v-if="canCancel" class="mt-6" :request-id="id" :event-status="loaded.eventStatus" :is-coordinator="canManageTechnicalRequirements" :is-organiser="loaded.organiserId===user?.id" :pending-request="false" @done="afterChangeDecided" />

   <Tabs v-model="tab" class="mt-8">
    <TabsList variant="line" aria-label="Request details and history" class="h-auto w-fit gap-1 rounded-none border-b bg-transparent p-0">
     <TabsTrigger value="details" :disabled="!tabsReady" class="h-auto rounded-none px-3 py-2">Details</TabsTrigger>
     <TabsTrigger value="history" :disabled="!tabsReady" class="h-auto rounded-none px-3 py-2">History</TabsTrigger>
    </TabsList>
    <TabsContent value="details" class="mt-6">
     <RequestFormPage v-model="form" :title="loaded.eventName || 'Untitled draft'" :status-label="loaded.statusLabel ?? REQUEST_STATUS_LABELS[loaded.status] ?? loaded.status" :show-header="false" :banner="coordinator as any" :disabled="mode==='readonly'" :is-submitting="isSubmitting" :submit-error="submitError" :field-errors="fieldErrors" :mode="mode" :can-edit="canEdit" :return-comments="loaded.decisionReason ?? ''" @save="save(false)" @submit="save(true)" @edit="editMode=true" />
    </TabsContent>
    <TabsContent value="history" class="mt-6">
     <RequestActivityHistory :key="historyRevision" :request-id="id" inside-tabs />
    </TabsContent>
   </Tabs>
  </template>
  <p v-else role="status" class="mt-6 text-sm text-muted-foreground">Loading request…</p>
 </main>
</template>
