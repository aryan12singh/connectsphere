<script setup lang="ts">
// CS-50: Technical Support view of notification deliveries that failed after
// 3 retries. Shows ids and the error only, never the notice text.
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Failure { messageId: string, messageType: string, aggregateId: string | null, attempts: number, lastError: string | null, failedAt: string }
const { data, error, refresh } = await useFetch<{ items: Failure[] }>('/api/notifications/failures')
</script>

<template>
  <Card class="mt-6">
    <CardHeader><CardTitle>Failed notification deliveries</CardTitle></CardHeader>
    <CardContent>
      <div v-if="error" role="alert"><p>Failed deliveries are unavailable.</p><button type="button" class="mt-2 underline" @click="refresh()">Try again</button></div>
      <p v-else-if="(data?.items ?? []).length === 0" class="text-sm text-muted-foreground">No failed deliveries.</p>
      <table v-else class="w-full text-left text-sm" data-testid="notification-failures">
        <thead class="text-xs text-muted-foreground"><tr><th class="py-2">Message</th><th>Request / event</th><th>Attempts</th><th>Error</th><th>Failed at</th></tr></thead>
        <tbody class="divide-y divide-border">
          <tr v-for="item in data?.items ?? []" :key="item.messageId"><td class="py-2">{{ item.messageType }}</td><td class="break-all">{{ item.aggregateId || '—' }}</td><td>{{ item.attempts }}</td><td>{{ item.lastError || '—' }}</td><td>{{ new Date(item.failedAt).toLocaleString() }}</td></tr>
        </tbody>
      </table>
    </CardContent>
  </Card>
</template>
