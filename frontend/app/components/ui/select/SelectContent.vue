<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type { SelectContentProps } from 'reka-ui'
import { reactiveOmit } from '@vueuse/core'
import { SelectContent, SelectPortal, SelectViewport, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'
const props = withDefaults(defineProps<SelectContentProps & { class?: HTMLAttributes['class'] }>(), { position: 'popper' })
const forwarded = useForwardProps(reactiveOmit(props, 'class'))
</script>
<template><SelectPortal><SelectContent v-bind="forwarded" :class="cn('bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 relative z-50 max-h-96 min-w-32 overflow-hidden rounded-md border shadow-md', props.class)"><SelectViewport class="p-1"><slot /></SelectViewport></SelectContent></SelectPortal></template>
