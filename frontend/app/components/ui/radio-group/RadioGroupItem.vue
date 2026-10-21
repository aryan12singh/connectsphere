<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type { RadioGroupItemProps } from 'reka-ui'
import { reactiveOmit } from '@vueuse/core'
import { RadioGroupIndicator, RadioGroupItem, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'
const props = defineProps<RadioGroupItemProps & { class?: HTMLAttributes['class'] }>()
const forwarded = useForwardProps(reactiveOmit(props, 'class'))
</script>
<template><RadioGroupItem v-bind="forwarded" :class="cn('border-primary text-primary focus-visible:ring-ring/30 size-4 shrink-0 rounded-full border shadow-xs outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50', props.class)"><RadioGroupIndicator class="flex items-center justify-center"><span class="size-2 rounded-full bg-current" /></RadioGroupIndicator></RadioGroupItem></template>
