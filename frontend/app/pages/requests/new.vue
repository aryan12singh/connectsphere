<script setup lang="ts">
import { ref } from 'vue'
import { emptyRequestForm, formToPayload } from '@/components/request-form-state'
import type { RequestFormState } from '@/components/request-form-state'

const requestForm = ref<RequestFormState>(emptyRequestForm())

const isSubmitting = ref(false)
const submitError = ref('')

function buildPayload(saveAs: 'draft' | 'submit') {
  return formToPayload(requestForm.value, { saveAs })
}

async function persist(saveAs: 'draft' | 'submit') {
  if (isSubmitting.value)
    return
  isSubmitting.value = true
  submitError.value = ''
  try {
    const { data, error } = await useFetch('/api/events', {
      method: 'POST',
      body: buildPayload(saveAs),
    })
    if (error.value || !data.value || typeof (data.value as { id?: unknown }).id !== 'string') {
      submitError.value = 'Could not save your request. Please check the highlighted fields and try again.'
      return
    }
    await refreshNuxtData('organiser-events')
    await navigateTo('/')
  }
  catch {
    submitError.value = 'Could not save your request. Please try again.'
  }
  finally {
    isSubmitting.value = false
  }
}

async function saveDraft() {
  await persist('draft')
}

async function submitRequest() {
  await persist('submit')
}

useHead({
  title: 'New event request | ConnectSphere',
})
</script>

<template>
  <main class="mx-auto w-full max-w-[90rem] px-5 pb-32 pt-6 md:px-8 md:py-8 lg:pb-8">
    <RequestFormPage
      v-model="requestForm"
      title="New event request"
      status-label="Draft"
      :is-submitting="isSubmitting"
      :submit-error="submitError"
      mode="create"
      @save-draft="saveDraft"
      @submit="submitRequest"
    />
  </main>
</template>
