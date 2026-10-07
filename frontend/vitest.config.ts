import { defineVitestConfig } from '@nuxt/test-utils/config'
import { fileURLToPath } from 'node:url'

export default defineVitestConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    environment: 'nuxt',
    include: ['frontend/tests/**/*.{test,spec}.{ts,js}', 'tests/specs/**/*.{test,spec}.{ts,js}'],
  },
})
