<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const alertVariants = cva('relative grid w-full grid-cols-[0_1fr] items-start gap-y-1 rounded-3xl border px-4 py-3 text-sm', { variants: { variant: { default: 'bg-card text-card-foreground', destructive: 'border-destructive/50 bg-destructive/10 text-destructive' } }, defaultVariants: { variant: 'default' } })
const props = defineProps<{ class?: HTMLAttributes['class'], variant?: VariantProps<typeof alertVariants>['variant'] }>()
</script>

<template><div data-slot="alert" role="alert" :class="cn(alertVariants({ variant }), props.class)"><slot /></div></template>
