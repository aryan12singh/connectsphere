<script setup lang="ts">
const requestFetch=useRequestFetch()
import { ref,computed } from 'vue'
import { emptyRequestForm, formToPayload } from '@/components/request-form-state'
import { fieldErrors as extractFields,operationIntent } from '@/components/request-errors'
import { apiErrorMessage } from '@/components/shared/api-error'
const requestForm=ref(emptyRequestForm()),isSubmitting=ref(false),submitError=ref(''),fieldErrors=ref<Record<string,string[]>>({})
const intent=operationIntent(),clean=ref(JSON.stringify(requestForm.value))
const dirty=computed(()=>JSON.stringify(requestForm.value)!==clean.value)
useUnsavedRequest(dirty)
const receipt=ref<{id:string,status:string}|null>(null)
async function persist(saveAs:'draft'|'submit') {
 if(isSubmitting.value)return
 isSubmitting.value=true;submitError.value='';fieldErrors.value={}
 const body=formToPayload(requestForm.value,{saveAs});const operationKey=intent.keyFor(body)
 try {
  const record=await requestFetch<{id:string,status:string}>('/api/events',{method:'POST',body:{...body,operationKey}})
  clean.value=JSON.stringify(requestForm.value);intent.clear();receipt.value=record
  await refreshNuxtData('organiser-events')
  if(saveAs==='draft')await navigateTo(`/requests/${record.id}`)
 }catch(e){submitError.value=apiErrorMessage(e,'Could not save. Your entries are kept; retry safely.');fieldErrors.value=extractFields(e)}
 finally{isSubmitting.value=false}
}
useHead({title:'New event request | ConnectSphere'})
</script>
<template>
 <main class="mx-auto w-full max-w-[90rem] px-5 pb-32 pt-6 md:px-8 md:py-8 lg:pb-8">
  <section v-if="receipt?.status==='SUBMITTED'" role="status" data-testid="submission-receipt" class="rounded-3xl border bg-card p-6">
   <h1 class="text-3xl font-semibold">Request submitted</h1><p class="mt-3">Under Review · Request ID: <strong>{{ receipt.id }}</strong></p>
   <NuxtLink :to="`/requests/${receipt.id}`" class="mt-4 inline-block underline">View your request</NuxtLink><NuxtLink to="/" class="ml-5 underline">My requests</NuxtLink>
  </section>
  <RequestFormPage v-else v-model="requestForm" title="New event request" status-label="Draft" :is-submitting="isSubmitting" :submit-error="submitError" :field-errors="fieldErrors" mode="create" @save-draft="persist('draft')" @submit="persist('submit')" />
 </main>
</template>
