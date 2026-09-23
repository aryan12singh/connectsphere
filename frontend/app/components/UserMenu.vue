<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'

const { user, fetch: refreshSession, clear: clearSession } = useUserSession()

const loadError = ref(false)
const logoutError = ref(false)
const isLoggingOut = ref(false)

onMounted(async () => {
  if (user.value)
    return
  try {
    await refreshSession()
  }
  catch {
    loadError.value = true
  }
})

const userName = computed(() => user.value?.name ?? '')
const userEmail = computed(() => user.value?.email ?? '')
const userRole = computed(() => user.value?.role ?? '')

const initials = computed(() => {
  const parts = userName.value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0)
    return 'U'
  const first = parts[0]?.[0] ?? ''
  const second = parts.length > 1 ? (parts[1]?.[0] ?? '') : (parts[0]?.[1] ?? '')
  return `${first}${second}`.toUpperCase()
})

const showError = computed(() => loadError.value || !user.value)

async function handleLogout() {
  if (isLoggingOut.value)
    return
  isLoggingOut.value = true
  logoutError.value = false
  try {
    await clearSession()
    await navigateTo('/login')
  }
  catch {
    logoutError.value = true
  }
  finally {
    isLoggingOut.value = false
  }
}
</script>

<template>
  <Popover>
    <PopoverTrigger aria-label="Your account" class="rounded-full">
      <Avatar size="sm">
        <AvatarFallback>{{ initials }}</AvatarFallback>
      </Avatar>
    </PopoverTrigger>
    <PopoverContent align="end" class="w-72">
      <div v-if="showError" role="alert" class="text-sm text-destructive">
        <p>Couldn't load your profile. Please try signing in again.</p>
      </div>
      <div v-else class="flex flex-col gap-3">
        <div class="min-w-0">
          <div class="flex items-center justify-between gap-3">
            <p class="min-w-0 flex-1 truncate text-sm font-medium">
              {{ userName }}
            </p>
            <Badge variant="secondary" class="shrink-0">
              {{ userRole }}
            </Badge>
          </div>
          <p class="mt-1 text-sm text-muted-foreground break-all">
            {{ userEmail }}
          </p>
        </div>
        <p v-if="logoutError" role="alert" class="text-sm text-destructive">
          Sign out failed. Please try again.
        </p>
        <Button
          variant="outline"
          size="sm"
          class="w-full"
          :disabled="isLoggingOut"
          @click="handleLogout"
        >
          {{ isLoggingOut ? 'Signing out…' : 'Sign out' }}
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
