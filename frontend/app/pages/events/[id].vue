<script setup lang="ts">
const route=useRoute(),id=String(route.params.id ?? '')
useHead({title:'Event activity | ConnectSphere'})
</script>
<template><main class="mx-auto max-w-[90rem] px-5 py-8"><NuxtLink to="/" class="underline">My requests</NuxtLink><h1 class="mt-4 text-3xl font-semibold">Event history</h1><p class="mt-2 break-all text-sm">Event ID: {{ id }}</p><div role="tablist" aria-label="Event activity" class="mt-4"><button role="tab" aria-selected="true">History</button></div><RequestActivityHistory request-id="" :event-id="id" /></main></template>
