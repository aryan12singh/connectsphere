<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  mode: 'create' | 'draft' | 'edit' | 'readonly'
}>(), {
  banner: null,
  disabled: false,
  isSubmitting: false,
  submitError: '',
  canEdit: true,
  returnComments: '',
  fieldErrors: () => ({}),
})

defineEmits<{
  (e: 'save-draft' | 'save' | 'submit' | 'edit'): void
}>()

const form = defineModel<RequestFormState>({ required: true })
</script>

<template>
  <div class="flex items-center gap-3">
    <h1 class="text-3xl font-semibold tracking-tight md:text-4xl">
      {{ title }}
    </h1>
    <Badge variant="secondary">
      {{ statusLabel }}
    </Badge>
  </div>

  <div
    v-if="banner"
    data-testid="coordinator-banner"
    class="mt-4 rounded-3xl border border-border bg-card p-4"
  >
    <p class="text-[10px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
      Assigned coordinator
    </p>
    <p class="mt-1 text-sm font-medium">
      {{ banner.name }}
    </p>
    <p class="text-sm text-muted-foreground break-all">
      {{ banner.email }}
    </p>
  </div>

  <aside v-if="returnComments" data-testid="return-comments" class="mt-5 rounded-3xl border border-border bg-card p-4"><h2 class="font-semibold">Coordinator comments</h2><p class="mt-2 whitespace-pre-wrap text-sm">{{ returnComments }}</p></aside>
  <form id="request-form" class="mt-6" novalidate @submit.prevent="$emit('submit')">
    <p v-if="submitError" role="alert" class="mb-4 text-sm text-destructive">
      {{ submitError }}
    </p>
    <EventRequestForm v-model="form" :disabled="disabled || isSubmitting" :field-errors="fieldErrors" />
    <div class="mt-6 grid gap-3" :class="mode === 'edit' || mode === 'readonly' ? 'grid-cols-1' : 'grid-cols-2'">
      <template v-if="mode === 'create'">
        <Button type="button" variant="outline" class="w-full" :disabled="isSubmitting || !hasMeaningfulInput(form)" @click="$emit('save-draft')">
          Save draft
        </Button>
        <Button type="submit" class="w-full" :disabled="isSubmitting">
          Submit request
        </Button>
      </template>
      <template v-else-if="mode === 'draft'">
        <Button type="button" variant="outline" class="w-full" :disabled="isSubmitting" @click="$emit('save')">
          Save changes
        </Button>
        <Button type="submit" class="w-full" :disabled="isSubmitting">
          Submit request
        </Button>
      </template>
      <template v-else-if="mode === 'edit'">
        <Button type="button" variant="outline" :disabled="isSubmitting || !hasMeaningfulInput(form)" @click="$emit('save')">Save changes</Button>
        <Button type="submit" class="w-full" :disabled="isSubmitting">Resubmit request</Button>
      </template>
      <template v-else>
        <Button v-if="canEdit" type="button" class="w-full" @click="$emit('edit')">
          Edit request
        </Button>
      </template>
    </div>
  </form>
</template>
