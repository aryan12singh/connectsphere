<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Toaster } from '@/components/ui/sonner'

const theme = ref<'light' | 'dark'>('light')
let themeObserver: MutationObserver | undefined

function syncTheme() {
  theme.value = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

onMounted(() => {
  syncTheme()
  themeObserver = new MutationObserver(syncTheme)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})

onBeforeUnmount(() => themeObserver?.disconnect())
</script>

<template>
  <Toaster :theme="theme" position="bottom-right" rich-colors close-button />
</template>
