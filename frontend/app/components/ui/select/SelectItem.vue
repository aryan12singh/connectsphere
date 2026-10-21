<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type { SelectItemProps } from 'reka-ui'
import { reactiveOmit } from '@vueuse/core'
import { SelectItem, SelectItemText, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'
const props = defineProps<SelectItemProps & { class?: HTMLAttributes['class'] }>()
const forwarded = useForwardProps(reactiveOmit(props, 'class'))
</script>
<template><SelectItem v-bind="forwarded" :class="cn('focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default items-center rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50', props.class)"><SelectItemText><slot /></SelectItemText></SelectItem></template>
