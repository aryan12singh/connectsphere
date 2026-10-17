<script setup lang="ts">
definePageMeta({permission:'safety.view'})
useHead({title:'Pending Safety Checks | ConnectSphere'})
const {data,error,refresh}=await useFetch<{items:Array<{id:string;eventId:string;eventTitle:string;startAt:string;number:number}>}>('/api/safety/rounds')
</script>
<template><main class="mx-auto grid max-w-5xl gap-5 px-5 py-8"><h1 class="text-3xl font-semibold">Pending Safety Checks</h1><p class="text-sm text-muted-foreground">Current reviews, soonest Event first.</p><button type="button" class="w-fit underline" @click="refresh()">Refresh queue</button><p v-if="error" role="alert">The Safety queue is unavailable. Refresh to try again.</p><p v-else-if="!data?.items.length" role="status">No Safety checks are awaiting review.</p><NuxtLink v-for="round in data?.items ?? []" :key="round.id" :to="`/safety-checks/${round.id}`" class="grid gap-2 rounded-2xl border border-border p-5 hover:bg-muted"><h2 class="font-semibold">{{ round.eventTitle }}</h2><p class="text-sm">{{ new Date(round.startAt).toLocaleString() }} · Review round {{ round.number }}</p></NuxtLink></main></template>
