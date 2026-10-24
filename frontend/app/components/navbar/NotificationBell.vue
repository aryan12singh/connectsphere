<script setup lang="ts">
// CS-50: bell with unread badge and the user's own notices.
// Clicking a notice marks it read (saved on the server) and opens its page.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { BellIcon } from '@lucide/vue'

interface Notice { id: string, type: string, text: string, link: string | null, createdAt: string, readAt: string | null }
interface Inbox { items: Notice[], unread: number, badge: string }

const open = ref(false)
const ready = ref(false)
const inbox = ref<Inbox>({ items: [], unread: 0, badge: '' })
const loading = ref(false)
const { showError } = useErrorAlert()

async function load() {
  try { inbox.value = await $fetch<Inbox>('/api/notifications') }
  catch { /* the bell stays as it was; the page still works */ }
}

async function toggle() {
  open.value = !open.value
  if (open.value) await load()
}

async function openNotice(notice: Notice) {
  if (loading.value) return
  loading.value = true
  try {
    if (!notice.readAt) await $fetch(`/api/notifications/${encodeURIComponent(notice.id)}/read`, { method: 'POST' })
    await load()
    open.value = false
    if (notice.link) await navigateTo(notice.link)
  }
  catch (caught) { showError(caught, 'Unable to open notification') }
  finally { loading.value = false }
}

function timeAgo(value: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60_000))
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`
  return new Date(value).toLocaleDateString()
}

// Refresh the badge every minute while the page is open.
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { ready.value = true; load(); timer = setInterval(load, 60_000) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

const label = computed(() => inbox.value.unread ? `Notifications, ${inbox.value.unread} unread` : 'Notifications')
</script>

<template>
  <div class="relative">
    <button type="button" class="relative flex size-8 items-center justify-center rounded-full hover:bg-muted" :disabled="!ready" :aria-label="label" :aria-expanded="open" data-testid="bell" @click="toggle">
      <BellIcon class="size-4" aria-hidden="true" />
      <span v-if="inbox.badge" id="bell-badge" class="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] leading-4 text-white">{{ inbox.badge }}</span>
    </button>
    <div v-if="open" id="notifications" role="dialog" aria-label="Notifications" class="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-border bg-background p-2 shadow-lg">
      <p v-if="inbox.items.length === 0" class="p-3 text-sm text-muted-foreground">No notifications yet.</p>
      <ul v-else class="max-h-96 divide-y divide-border overflow-y-auto">
        <li v-for="notice in inbox.items" :key="notice.id">
          <button type="button" class="w-full rounded-lg p-3 text-left text-sm hover:bg-muted disabled:opacity-60" :class="notice.readAt ? 'text-muted-foreground' : 'font-medium'" :disabled="loading" :data-notice-id="notice.id" @click="openNotice(notice)">
            <span class="block">{{ notice.text }}</span>
            <span class="mt-1 block text-xs text-muted-foreground">{{ timeAgo(notice.createdAt) }}<span v-if="!notice.readAt"> · Unread</span></span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
