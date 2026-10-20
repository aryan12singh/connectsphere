<script setup lang="ts">
// CS-10 Week 7: the Event Coordinator Lead's landing screen.
// The queue itself (unassigned requests, assign/reassign) is delivered by
// CS-81 and CS-30. Until then this page only confirms the Lead's access.
definePageMeta({ permission: 'assignments.view' })
useHead({ title: 'Unassigned Queue | ConnectSphere' })
const { user } = useUserSession()
</script>

<template>
  <main class="mx-auto grid max-w-5xl gap-5 px-5 py-8">
    <h1 class="text-3xl font-semibold">Unassigned Queue</h1>
    <p class="text-sm text-muted-foreground">Signed in as {{ user?.name }} (Coordinator Lead).</p>
    <section class="rounded-2xl border border-border p-5" data-testid="lead-queue-placeholder">
      <h2 class="font-semibold">No queue items yet</h2>
      <p class="mt-2 text-sm">Event requests waiting for a Coordinator will be listed here, with assignment and reassignment, once the Lead queue (CS-81) and Lead assignment (CS-30) are delivered.</p>
      <p class="mt-2 text-sm text-muted-foreground">As a Lead you supervise assignments. You cannot approve, reject or confirm events, or manage venues.</p>
    </section>
  </main>
</template>
