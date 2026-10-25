<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import EventRequestForm from './EventRequestForm.vue'
import { hasMeaningfulInput, type RequestFormState } from './request-form-state'

export interface CoordinatorBanner {
  name?: unknown
  email?: unknown
}

withDefaults(defineProps<{
  title: string
  statusLabel: string
  banner?: CoordinatorBanner | null
  disabled?: boolean
  isSubmitting?: boolean
  submitError?: string
  canEdit?: boolean
  returnComments?: string
  fieldErrors?: Record<string,string[]>
  showHeader?: boolean
  mode: 'create' | 'draft' | 'edit' | 'readonly'
}>(), {
  banner: null,
  disabled: false,
  isSubmitting: false,
  submitError: '',
  canEdit: true,
  returnComments: '',
  fieldErrors: () => ({}),
  showHeader: true,
})

defineEmits<{
  (e: 'save-draft' | 'save' | 'submit' | 'edit'): void
}>()

const form = defineModel<RequestFormState>({ required: true })
// SSR controls remain inert until input and submit handlers are attached.
const ready = ref(false)
onMounted(() => { ready.value = true })
</script>

<template>
  <div v-if="showHeader" class="flex flex-wrap items-center gap-3">
    <h1 class="text-3xl font-semibold tracking-tight md:text-4xl">
      {{ title }}
    </h1>
    <Badge variant="secondary">
      {{ statusLabel }}
    </Badge>
  </div>

  <Card
    v-if="banner"
    data-testid="coordinator-banner"
    class="mt-6 gap-0 rounded-[18px] border border-border !bg-transparent py-0 !shadow-none !ring-0"
  >
    <CardHeader class="px-5 py-4 md:px-6">
      <CardDescription>Assigned coordinator</CardDescription>
      <CardTitle v-if="typeof banner.name === 'string' && banner.name.trim()" class="mt-1">{{ banner.name }}</CardTitle>
      <CardDescription class="break-all">{{ banner.email }}</CardDescription>
    </CardHeader>
  </Card>

  <Card v-if="returnComments" data-testid="return-comments" class="mt-5 gap-0 rounded-[18px] border border-border !bg-transparent py-0 !shadow-none !ring-0">
    <CardHeader class="px-5 py-4 md:px-6">
      <CardTitle>Coordinator comments</CardTitle>
    </CardHeader>
    <CardContent class="border-t border-border px-5 py-4 text-sm whitespace-pre-wrap md:px-6">{{ returnComments }}</CardContent>
  </Card>

  <form id="request-form" class="mt-6" novalidate @submit.prevent="$emit('submit')">
    <Alert v-if="submitError" variant="destructive" class="mb-5"><p class="col-start-2">{{ submitError }}</p></Alert>
    <EventRequestForm v-model="form" :disabled="!ready || disabled || isSubmitting" :field-errors="fieldErrors" />
    <div class="mt-8 flex flex-wrap justify-end gap-3 border-t border-border pt-5">
      <template v-if="mode === 'create'">
        <Button type="button" variant="outline" :disabled="!ready || isSubmitting || !hasMeaningfulInput(form)" @click="$emit('save-draft')">
          Save draft
        </Button>
        <Button type="submit" :disabled="!ready || isSubmitting">
          Submit request
        </Button>
      </template>
      <template v-else-if="mode === 'draft'">
        <Button type="button" variant="outline" :disabled="!ready || isSubmitting" @click="$emit('save')">
          Save changes
        </Button>
        <Button type="submit" :disabled="!ready || isSubmitting">
          Submit request
        </Button>
      </template>
      <template v-else-if="mode === 'edit'">
        <Button type="button" variant="outline" :disabled="!ready || isSubmitting || !hasMeaningfulInput(form)" @click="$emit('save')">Save changes</Button>
        <Button type="submit" :disabled="!ready || isSubmitting">Resubmit request</Button>
      </template>
      <template v-else>
        <Button v-if="canEdit" type="button" :disabled="!ready || isSubmitting" @click="$emit('edit')">
          Edit request
        </Button>
      </template>
    </div>
  </form>
</template>
