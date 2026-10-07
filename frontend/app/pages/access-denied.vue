<script setup lang="ts">
import { roleHome } from '~~/lib/roles'
const { user } = useUserSession()
useHead({ title: 'Access denied | ConnectSphere' })
</script>
<template>
  <main class="mx-auto max-w-3xl px-5 py-12">
    <h1 class="text-3xl font-semibold">Access denied</h1>
    <p class="mt-3">Your account does not have access to this page.</p>
    <NuxtLink :to="roleHome(user?.role ?? '')" class="mt-5 inline-block text-primary underline">Return to your home</NuxtLink>
  </main>
</template>
