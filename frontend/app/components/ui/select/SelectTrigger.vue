<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type { SelectTriggerProps } from 'reka-ui'
import { reactiveOmit } from '@vueuse/core'
import { SelectTrigger, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'
const props = defineProps<SelectTriggerProps & { class?: HTMLAttributes['class'] }>()
const forwarded = useForwardProps(reactiveOmit(props, 'class'))
</script>
<template><SelectTrigger v-bind="forwarded" :class="cn('border-input focus-visible:border-ring focus-visible:ring-ring/30 data-[placeholder]:text-muted-foreground flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm whitespace-nowrap shadow-xs outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0', props.class)"><slot /></SelectTrigger></template>
