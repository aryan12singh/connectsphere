<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import EventRequestForm from './EventRequestForm.vue'
import type { RequestFormState } from './request-form-state'

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
  mode: 'create' | 'draft' | 'edit' | 'readonly'
}>(), {
  banner: null,
  disabled: false,
  isSubmitting: false,
  submitError: '',
  canEdit: true,
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

  <form id="request-form" class="mt-6" @submit.prevent="mode === 'edit' ? $emit('save') : $emit('submit')">
    <p v-if="submitError" role="alert" class="mb-4 text-sm text-destructive">
      {{ submitError }}
    </p>
    <EventRequestForm v-model="form" :disabled="disabled" />
    <div class="mt-6 grid gap-3" :class="mode === 'edit' || mode === 'readonly' ? 'grid-cols-1' : 'grid-cols-2'">
      <template v-if="mode === 'create'">
        <Button type="button" variant="outline" class="w-full" :disabled="isSubmitting" @click="$emit('save-draft')">
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
        <Button type="submit" class="w-full" :disabled="isSubmitting">
          Save and Submit
        </Button>
      </template>
      <template v-else>
        <Button v-if="canEdit" type="button" class="w-full" @click="$emit('edit')">
          Edit request
        </Button>
      </template>
    </div>
  </form>
</template>
