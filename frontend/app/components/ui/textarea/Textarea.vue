<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { useVModel } from '@vueuse/core'
import { cn } from '@/lib/utils'

const props = defineProps<{ modelValue?: string, defaultValue?: string, class?: HTMLAttributes['class'] }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()
const value = useVModel(props, 'modelValue', emit, { passive: true, defaultValue: props.defaultValue })
</script>

<template>
  <textarea v-model="value" data-slot="textarea" :class="cn('border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-3 aria-invalid:ring-3 disabled:cursor-not-allowed disabled:opacity-50', props.class)" />
</template>
